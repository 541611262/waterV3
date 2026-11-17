// 登录与成员身份
import { AppError, db, getAuth, toAppError, unwrap } from './cloud'
import type { Member, MemberName } from './types'

export interface SessionUser {
  uid: string
  username: string
}

function readUser(user: unknown): SessionUser | null {
  const u = (user ?? {}) as Record<string, unknown>
  const uid = u.id ?? u.uid ?? u.sub
  if (!uid || u.is_anonymous || u.isAnonymous) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const username = String(u.username ?? u.name ?? meta.username ?? meta.name ?? '')
  return { uid: String(uid), username }
}

/** 当前登录用户；未登录返回 null（未登录时部分 SDK 版本会抛错，一律按未登录处理） */
export async function currentUser(): Promise<SessionUser | null> {
  const auth = await getAuth()
  try {
    const result = await auth.getSession()
    const user = readUser(result?.data?.session?.user)
    if (user) return user
  } catch {
    // 未登录
  }
  try {
    const result = await auth.getUser()
    const data = result && 'data' in result ? result.data : result
    return readUser(data && typeof data === 'object' && 'user' in data ? data.user : data)
  } catch {
    return null
  }
}

export async function signIn(username: string, password: string): Promise<SessionUser> {
  const auth = await getAuth()
  try {
    unwrap(await auth.signInWithPassword({ username, password }))
  } catch (error) {
    throw toAppError(error)
  }
  const user = await currentUser()
  if (!user) throw new AppError('登录失败，请重试')
  if (!user.username) user.username = username
  return user
}

export async function signOut(): Promise<void> {
  const auth = await getAuth()
  await auth.signOut()
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const auth = await getAuth()
  unwrap(await auth.resetPasswordForOld({ old_password: oldPassword, new_password: newPassword }))
}

/** 读取自己的成员记录；第一次登录时登记为普通成员（数据库只允许以 member 身份登记自己） */
export async function loadMember(user: SessionUser): Promise<Member> {
  const rdb = await db()
  const rows = unwrap<Member[]>(await rdb.from('members').select('uid, username, role').eq('uid', user.uid))
  if (rows?.length) return rows[0]!
  const created = unwrap<Member[]>(
    await rdb.from('members').insert({ uid: user.uid, username: user.username, role: 'member' }).select('uid, username, role'),
  )
  return created?.[0] ?? { uid: user.uid, username: user.username, role: 'member' }
}

/** 所有成员的姓名（派单、显示负责人用） */
export async function memberDirectory(): Promise<MemberName[]> {
  const rdb = await db()
  return unwrap<MemberName[]>(await rdb.rpc('v4_member_directory')) ?? []
}

/** 管理员：全部成员及角色 */
export async function listMembers(): Promise<(Member & { created_at: string })[]> {
  const rdb = await db()
  return unwrap(await rdb.from('members').select('uid, username, role, created_at').order('created_at')) ?? []
}

export async function setMemberRole(uid: string, role: Member['role']): Promise<void> {
  const rdb = await db()
  const rows = unwrap<Member[]>(await rdb.from('members').update({ role }).eq('uid', uid).select('uid'))
  if (!rows?.length) throw new AppError('没有权限修改角色')
}
