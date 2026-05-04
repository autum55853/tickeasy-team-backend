import { AppDataSource } from '../../config/database.js';
import { User, UserRole } from '../../models/user.js';
import { Organization } from '../../models/organization.js';
import { Venue } from '../../models/venue.js';
import { LocationTag } from '../../models/location-tag.js';
import { MusicTag } from '../../models/music-tag.js';
import { generateToken } from '../../utils/index.js';

/**
 * 建立測試用戶（密碼會由 @BeforeInsert hook 自動 hash）
 */
export async function createTestUser(overrides: Partial<{
  email: string;
  name: string;
  password: string;
  role: UserRole;
  isEmailVerified: boolean;
}> = {}): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const user = repo.create({
    email: overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: overrides.name ?? 'Test User',
    password: overrides.password ?? 'Test1234',
    role: overrides.role ?? UserRole.USER,
    isEmailVerified: overrides.isEmailVerified ?? true,
    nickname: '',
    phone: '',
    oauthProviders: [],
  });
  return repo.save(user);
}

/**
 * 產生已認證的 JWT token
 */
export function generateTestToken(userId: string, role: string = 'user'): string {
  return generateToken({ userId, role });
}

/**
 * 建立測試組織
 */
export async function createTestOrganization(userId: string, overrides: Partial<{
  orgName: string;
}> = {}): Promise<Organization> {
  const repo = AppDataSource.getRepository(Organization);
  return repo.save(repo.create({
    userId,
    orgName: overrides.orgName ?? `Test Org ${Date.now()}`,
    orgAddress: '台北市測試路1號',
    orgMail: 'org@test.com',
    orgContact: '02-12345678',
  }));
}

/**
 * 建立測試場地
 */
export async function createTestVenue(overrides: Partial<{
  venueName: string;
}> = {}): Promise<Venue> {
  const repo = AppDataSource.getRepository(Venue);
  return repo.save(repo.create({
    venueName: overrides.venueName ?? `Test Venue ${Date.now()}`,
    venueAddress: '台北市測試路2號',
    venueCapacity: 1000,
    isAccessible: false,
    hasParking: false,
    hasTransit: false,
  }));
}

/**
 * 建立測試地區標籤
 */
export async function createTestLocationTag(name?: string): Promise<LocationTag> {
  const repo = AppDataSource.getRepository(LocationTag);
  return repo.save(repo.create({
    locationTagName: name ?? `測試地區 ${Date.now()}`,
  }));
}

/**
 * 建立測試音樂類型標籤
 */
export async function createTestMusicTag(name?: string): Promise<MusicTag> {
  const repo = AppDataSource.getRepository(MusicTag);
  return repo.save(repo.create({
    musicTagName: name ?? `測試音樂 ${Date.now()}`,
  }));
}
