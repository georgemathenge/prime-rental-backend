import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdatePaymentDto } from './dto/update-payment.dto.js';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FindAllPaymentsDto } from './dto/find-payment.dto.js';
import { AssignTransactionDto } from './dto/assign-transaction.dto.js';
import { FindAllBankTransactionsDto } from './dto/find-bank-transactions.dto.js';

/////////////////
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export enum BankType {
  EQUITY = 'equity',
  KCB = 'kcb',
  COOPERATIVE = 'cooperative',
} ////////////////////

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPaymentDto: CreatePaymentDto) {
    return 'This action adds a new payment';
  }

  findOne(id: number) {
    return `This action returns a #${id} payment`;
  }

  update(id: number, updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }

  async uploadAndReconcile(
    rows: {
      bankReference: string;
      amount: number;
      transactionDate: Date;
      narrative: string;
      payerPhone?: string;
    }[],
    createdById: string,
    propertyId: string,
  ) {
    const results = {
      matched: 0,
      unmatched: 0,
      skipped: 0,
      skippedReferences: [] as string[],
    };

    for (const row of rows) {
      // Check duplicate outside transaction — read only, safe
      const existing = await this.prisma.bankTransaction.findUnique({
        where: { bankReference: row.bankReference }, //////////////////////////////////////////////////////////
      });

      if (existing) {
        results.skipped++;
        results.skippedReferences.push(row.bankReference);
        continue;
      }

      try {
        const matched = await this.prisma.$transaction(async (tx) => {
          // 1. Create bank transaction inside transaction
          const bankTx = await tx.bankTransaction.create({
            data: {
              bankReference: row.bankReference,
              amount: row.amount,
              propertyId: propertyId,
              transactionDate: row.transactionDate,
              narrative: row.narrative,
              payerPhone: row.payerPhone ?? null,
              status: MatchStatus.PENDING,
            },
          });

          // 2. Try to reconcile — all reads and writes inside same tx
          return this.reconcileInsideTx(tx, bankTx, createdById);
        });

        if (matched) {
          results.matched++;
        } else {
          results.unmatched++;
        }
      } catch (err) {
        console.error(`Failed to process row ${row.bankReference}:`, err);
        results.skipped++;
        results.skippedReferences.push(row.bankReference);
      }
    }

    return results;
  }

  // ─── Reconcile Inside Transaction ─────────────────────────────────────

  private async reconcileInsideTx(
    tx: Prisma.TransactionClient,
    bankTx: {
      id: string;
      payerPhone?: string | null;
      amount: any;
      propertyId: string;
    },
    createdById: string,
  ): Promise<boolean> {
    if (!bankTx.payerPhone) {
      await tx.bankTransaction.update({
        where: { id: bankTx.id },
        data: { status: MatchStatus.MANUAL_INTERVENTION },
      });
      return false;
    }

    // Tier 1 — primary phone match
    const tenantByPhone = await tx.tenant.findUnique({
      where: { primaryPhone: bankTx.payerPhone },
      include: {
        lease: {
          where: { endDate: null, house: { propertyId: bankTx.propertyId } },
          take: 1,
          include: {
            house: { select: { id: true, houseCode: true } },
            tenant: { select: { id: true, fullName: true } },
            invoices: {
              where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (tenantByPhone?.lease?.[0]) {
      // Tier 1
      if (!tenantByPhone || !tenantByPhone.lease?.[0]) {
        // falls through to Tier 2
      } else {
        const lease = tenantByPhone.lease[0];
        return this.applyPaymentInsideTx(
          tx,
          bankTx,
          {
            houseId: lease.houseId,
            tenantId: tenantByPhone.id,
            tenantName: tenantByPhone.fullName,
            houseCode: lease.house.houseCode,
            invoices: lease.invoices,
          },
          1,
          createdById,
        );
      }
    }

    // Tier 2 — known payer match
    const knownPayer = await tx.knownPayer.findFirst({
      where: { phone: bankTx.payerPhone, propertyId: bankTx.propertyId },
      select: { tenantId: true },
    });

    if (knownPayer) {
      const tenant = await tx.tenant.findUnique({
        where: { id: knownPayer.tenantId },
        include: {
          lease: {
            where: {
              endDate: null,
              house: { propertyId: bankTx.propertyId },
            },
            orderBy: { startDate: 'desc' },
            take: 1,
            include: {
              house: { select: { id: true, houseCode: true } },
              invoices: {
                where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          },
        },
      });

      if (tenant?.lease?.[0]) {
        const lease = tenant.lease[0];
        return this.applyPaymentInsideTx(
          tx,
          bankTx,
          {
            houseId: lease.houseId,
            tenantId: tenant.id,
            tenantName: tenant.fullName,
            houseCode: lease.house.houseCode,
            invoices: lease.invoices,
          },
          2,
          createdById,
        );
      }
    }

    // No match — manual intervention
    await tx.bankTransaction.update({
      where: { id: bankTx.id },
      data: { status: MatchStatus.MANUAL_INTERVENTION },
    });
    return false;
  }

  // ─── Apply Payment Inside Transaction ────────────────────────────────

  async applyPaymentInsideTx(
    tx: Prisma.TransactionClient,
    bankTx: { id: string; amount: any },
    lease: {
      houseId: string;
      tenantId: string; // ← add
      tenantName: string; // ← add
      houseCode: string;
      invoices?: Array<{
        id: string;
        balanceDue: any;
        paidAmount: any;
        totalAmount: any;
      }>;
    },
    matchLevel: number,
    createdById: string,
  ): Promise<boolean> {
    if (!lease) {
      await tx.bankTransaction.update({
        where: { id: bankTx.id },
        data: {
          status: MatchStatus.FLAGGED,
        },
      });
      return false;
    }

    const invoice = lease.invoices?.[0];

    // No unpaid invoice — can't auto-reconcile
    // mark for manual intervention so owner can assign correctly
    // No invoice found — mark as OVERPAYMENT since we know the tenant and house
    if (!invoice) {
      // ← payment created here with invoiceId: null
      await tx.payment.create({
        data: {
          houseId: lease.houseId,
          bankTransactionId: bankTx.id,
          amount: bankTx.amount,
          datePaid: new Date(),
          invoiceId: null,
          createdById,
        },
      });

      await tx.bankTransaction.update({
        where: { id: bankTx.id },
        data: {
          status: MatchStatus.OVER_PAYMENT,
          matchNote: `Tenant ${lease.tenantName} — no unpaid invoice found for house ${lease.houseCode}`,
          matchLevel,
        },
      });
      return false; // ← then return
    }

    const paymentAmount = Number(bankTx.amount);
    const currentBalance = Number(invoice.balanceDue);
    const currentPaid = Number(invoice.paidAmount);
    const currentTotal = Number(invoice.totalAmount);

    let invoiceUpdate: Prisma.InvoiceUpdateInput = {};

    if (paymentAmount >= currentBalance) {
      invoiceUpdate = {
        paidAmount: currentTotal,
        balanceDue: 0,
        excessAmount: paymentAmount - currentBalance,
        status: 'PAID',
      };
    } else {
      invoiceUpdate = {
        paidAmount: currentPaid + paymentAmount,
        balanceDue: currentBalance - paymentAmount,
        status: 'PARTIAL',
      };
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: invoiceUpdate,
    });

    await tx.payment.create({
      data: {
        houseId: lease.houseId,
        bankTransactionId: bankTx.id,
        amount: bankTx.amount,
        datePaid: new Date(),
        invoiceId: invoice.id,
        createdById,
      },
    });

    await tx.bankTransaction.update({
      where: { id: bankTx.id },
      data: { status: MatchStatus.MATCHED, matchLevel },
    });

    return true;
  }

  async assignTransaction(
    bankTxId: string,
    dto: AssignTransactionDto,
    createdById: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const bankTx = await tx.bankTransaction.findUnique({
        where: { id: bankTxId },
      });

      if (!bankTx) throw new NotFoundException('Bank transaction not found.');
      if (bankTx.status === MatchStatus.MATCHED) {
        throw new BadRequestException('Transaction already matched.');
      }

      const activeLease = await tx.lease.findFirst({
        where: {
          houseId: dto.houseId,
          endDate: null,
          // status: 'ACTIVE',
        },
        select: {
          tenantId: true,
          tenant: { select: { primaryPhone: true, fullName: true } },
        },
      });

      if (
        bankTx.payerPhone &&
        activeLease &&
        bankTx.payerPhone !== activeLease.tenant.primaryPhone
      ) {
        const existingKnownPayer = await tx.knownPayer.findFirst({
          where: { phone: bankTx.payerPhone, tenantId: activeLease.tenantId },
        });
        console.log(existingKnownPayer, 'existing known payer');

        if (!existingKnownPayer) {
          await tx.knownPayer.create({
            data: {
              phone: bankTx.payerPhone,
              tenantId: activeLease.tenantId,
              propertyId: bankTx.propertyId,
              name: this.extractNameFromNarrative(bankTx.narrative) ?? null,
            },
          });

          console.log(
            `Auto-registered known payer ${bankTx.payerPhone} for tenant ${activeLease.tenant.fullName}`,
          );
        }
      }

      // Get invoice — provided or FIFO
      let invoice: {
        id: string;
        balanceDue: any;
        paidAmount: any;
        totalAmount: any;
      } | null = null;

      if (dto.invoiceId) {
        invoice = await tx.invoice.findUnique({
          where: { id: dto.invoiceId },
          select: {
            id: true,
            balanceDue: true,
            paidAmount: true,
            totalAmount: true,
          },
        });
      } else {
        invoice = await tx.invoice.findFirst({
          where: {
            houseId: dto.houseId,
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
          },
          orderBy: { createdAt: 'asc' }, // FIFO
          select: {
            id: true,
            balanceDue: true,
            paidAmount: true,
            totalAmount: true,
          },
        });
      }

      const paymentAmount = Number(bankTx.amount);

      if (invoice) {
        const currentBalance = Number(invoice.balanceDue);
        const currentPaid = Number(invoice.paidAmount);
        const currentTotal = Number(invoice.totalAmount);

        let invoiceUpdate: Prisma.InvoiceUpdateInput = {};

        if (paymentAmount >= currentBalance) {
          invoiceUpdate = {
            paidAmount: currentTotal,
            balanceDue: 0,
            excessAmount: paymentAmount - currentBalance,
            status: 'PAID',
          };
        } else {
          invoiceUpdate = {
            paidAmount: currentPaid + paymentAmount,
            balanceDue: currentBalance - paymentAmount,
            status: 'PARTIAL',
          };
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: invoiceUpdate,
        });
      }

      // Create payment
      await tx.payment.create({
        data: {
          houseId: dto.houseId,
          bankTransactionId: bankTxId,
          amount: bankTx.amount,
          datePaid: new Date(),
          invoiceId: invoice?.id ?? null,
          note: dto.note,
          createdById,
        },
      });

      // Mark matched
      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: {
          status: MatchStatus.MATCHED,
          matchLevel: 4,
        },
      });

      return { success: true };
    });
  }

  // ─── Find All Bank Transactions ───────────────────────────────────────

  async findAllBankTransactions(dto: FindAllBankTransactionsDto) {
    const { propertyId, status, search, page = 1, limit = 20 } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.BankTransactionWhereInput = {};

    // Scope to property via payments → house relation
    if (propertyId) {
      where.propertyId = propertyId;
    }

    if (status) where.status = status;

    if (search) {
      where.OR = [
        { bankReference: { contains: search, mode: 'insensitive' } },
        { narrative: { contains: search, mode: 'insensitive' } },
        { payerPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        select: {
          id: true,
          bankReference: true,
          amount: true,
          transactionDate: true,
          narrative: true,
          payerPhone: true,
          status: true,
          matchLevel: true,
          createdAt: true,
          payments: {
            select: {
              id: true,
              house: {
                select: {
                  houseCode: true,
                  property: { select: { name: true } },
                },
              },
              invoice: {
                select: {
                  invoiceNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /////Testing PDf to json

  async parseStatement(fileBuffer: Buffer, bankType: BankType): Promise<any> {
    // 1. Write buffer to a temp file (Python needs a file path)
    const tempPath = join(tmpdir(), `${uuidv4()}.pdf`);

    try {
      await writeFile(tempPath, fileBuffer);
      const result = await this.runPythonParser(bankType, tempPath);
      return result;
    } finally {
      // Always clean up temp file
      await unlink(tempPath).catch(() => null);
    }
  }

  async uploadPdfAndReconcile(
    fileBuffer: Buffer,
    bankType: BankType,
    createdById: string,
    propertyId: string,
  ) {
    // 1. Parse PDF via Python
    const parsed = await this.parseStatement(fileBuffer, bankType);

    // 2. Filter credits only — debits are outgoing, not relevant
    const credits = (parsed.transactions as any[]).filter(
      (tx) => tx.type === 'credit',
    );

    if (!credits.length) {
      return {
        matched: 0,
        unmatched: 0,
        skipped: 0,
        skippedReferences: [],
        meta: parsed,
      };
    }

    // 3. Transform to our row format
    const rows = credits.map((tx) => ({
      bankReference: this.generateReference(tx, bankType, propertyId),
      amount: tx.amount,
      transactionDate: this.parseDate(tx.date),
      narrative: tx.particulars,
      payerPhone: this.extractPhone(tx.particulars),
    }));

    // 4. Run reconciliation
    const results = await this.uploadAndReconcile(
      rows,
      createdById,
      propertyId,
    );

    return {
      ...results,
      meta: {
        bank: parsed.bank,
        accountHolder: parsed.account_holder,
        accountNumber: parsed.account_number,
        periodFrom: parsed.period_from,
        periodTo: parsed.period_to,
        openingBalance: parsed.opening_balance,
        closingBalance: parsed.closing_balance,
        totalCredits: parsed.total_credits,
        totalDebits: parsed.total_debits,
        creditRowsFound: credits.length,
      },
    };
  }

  // ─── Extract phone from narrative ─────────────────────────────────────

  private extractPhone(narrative: string): string | undefined {
    if (!narrative) return undefined;

    // Match Kenyan phone formats in narrative:
    // 0712345678, 254712345678, +254712345678
    const match = narrative.match(/(?:\+?254|0)(7\d{8}|1\d{8})/);

    if (!match) return undefined;

    // Normalize to 07XXXXXXXX format
    const digits = match[1]; // e.g. 712345678
    return `0${digits}`;
  }
  private extractNameFromNarrative(narrative: string): string | null {
    if (!narrative) return null;
    // Remove phone number and common prefixes, take what remains as name
    const cleaned = narrative
      .replace(/(?:\+?254|0)(7\d{8}|1\d{8})/, '')
      .replace(/MPESA|PAYMENT|FROM|TRANSFER|MOBILE|M-PESA/gi, '')
      .trim();
    return cleaned.length > 2 ? cleaned : null;
  }

  // ─── Generate unique bank reference ──────────────────────────────────

  private generateReference(
    tx: any,
    bankType: string,
    propertyId: string,
  ): string {
    const dateStr = tx.date.replace(/-/g, '');
    const amountStr = String(tx.amount).replace('.', '');
    const propShort = propertyId.slice(0, 8); // first 8 chars of UUID
    return `${bankType.toUpperCase()}-${propShort}-${dateStr}-${tx.index}-${amountStr}`;
  }

  // ─── Parse DD-MM-YYYY to Date ─────────────────────────────────────────

  private parseDate(dateStr: string): Date {
    // Equity format: DD-MM-YYYY
    const [day, month, year] = dateStr.split('-');
    return new Date(`${year}-${month}-${day}`);
  }

  // // ─── Parse PDF via Python ─────────────────────────────────────────────

  // private async parseStatement(
  //   fileBuffer: Buffer,
  //   bankType: BankType,
  // ): Promise<any> {
  //   const tempPath = join(tmpdir(), `${uuidv4()}.pdf`);

  //   try {
  //     await writeFile(tempPath, fileBuffer);
  //     return await this.runPythonParser(bankType, tempPath);
  //   } finally {
  //     await unlink(tempPath).catch(() => null);
  //   }
  // }

  private runPythonParser(bankType: BankType, filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonExecutable = process.env.PYTHON_PATH || 'python3';
      const scriptPath = join(
        process.env.PYTHON_SCRIPTS_PATH || '../bank-python-parsers',
        'main.py',
      );

      const process_ = spawn(pythonExecutable, [
        scriptPath,
        bankType,
        filePath,
      ]);

      let stdout = '';
      let stderr = '';

      process_.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process_.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process_.on('close', (code) => {
        if (code !== 0) {
          reject(new InternalServerErrorException(`Parser failed: ${stderr}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) {
            reject(new BadRequestException(parsed.error));
            return;
          }
          resolve(parsed);
        } catch {
          reject(
            new InternalServerErrorException(
              'Failed to parse Python output as JSON',
            ),
          );
        }
      });

      process_.on('error', (err) => {
        reject(
          new InternalServerErrorException(
            `Could not start Python: ${err.message}`,
          ),
        );
      });
    });
  }
}
