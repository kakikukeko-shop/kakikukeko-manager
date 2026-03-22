'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      const isLoginPage = pathname === '/login'

      if (!session && !isLoginPage) {
        router.replace('/login')
        return
      }

      if (session && isLoginPage) {
        router.replace('/')
        return
      }

      setReady(true)
    }

    check()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const isLoginPage = pathname === '/login'

      if (!session && !isLoginPage) {
        router.replace('/login')
        return
      }

      if (session && isLoginPage) {
        router.replace('/')
        return
      }

      setReady(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [pathname, router])

  if (!ready) return null

  return <>{children}</>
}