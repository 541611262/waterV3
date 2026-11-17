// 登录状态：当前账号、角色、成员通讯录
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import type { Member, MemberName } from '@/api/types'

export const useSessionStore = defineStore('session', () => {
  const member = ref<Member | null>(null)
  const directory = ref<MemberName[]>([])
  const ready = ref(false)

  const isLoggedIn = computed(() => member.value !== null)
  const isAdmin = computed(() => member.value?.role === 'admin')
  const uid = computed(() => member.value?.uid ?? '')

  function memberName(id: string | null | undefined): string {
    if (!id) return ''
    return directory.value.find((m) => m.uid === id)?.username ?? ''
  }

  async function refreshDirectory() {
    directory.value = await authApi.memberDirectory()
  }

  /** 应用启动时恢复登录状态 */
  async function restore() {
    try {
      const user = await authApi.currentUser()
      if (user) {
        member.value = await authApi.loadMember(user)
        await refreshDirectory()
      }
    } catch {
      member.value = null
    } finally {
      ready.value = true
    }
  }

  async function login(username: string, password: string) {
    const user = await authApi.signIn(username.trim(), password)
    member.value = await authApi.loadMember(user)
    await refreshDirectory()
  }

  async function logout() {
    try {
      await authApi.signOut()
    } finally {
      member.value = null
      directory.value = []
    }
  }

  return { member, directory, ready, isLoggedIn, isAdmin, uid, memberName, restore, login, logout, refreshDirectory }
})
