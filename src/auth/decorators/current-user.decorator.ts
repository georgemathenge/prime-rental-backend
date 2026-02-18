import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../dto/current-user.dto.js';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
