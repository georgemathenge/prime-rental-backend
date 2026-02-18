export class UserProfileDto {
  username: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  avatar_url: string | null;
}
