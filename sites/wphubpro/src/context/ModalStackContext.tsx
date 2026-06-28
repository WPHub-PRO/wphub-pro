import type { ChildrenType } from '@/types'
import { createContext, use, useCallback, useMemo, useState } from 'react'

type ModalStackContextType = {
  register: (id: string) => void
  unregister: (id: string) => void
  isTopmost: (id: string) => boolean
}

const ModalStackContext = createContext<ModalStackContextType | undefined>(undefined)

export function ModalStackProvider({ children }: ChildrenType) {
  const [stack, setStack] = useState<string[]>([])

  const register = useCallback((id: string) => {
    setStack((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const unregister = useCallback((id: string) => {
    setStack((prev) => prev.filter((entry) => entry !== id))
  }, [])

  const isTopmost = useCallback(
    (id: string) => {
      if (stack.length === 0) return true
      return stack[stack.length - 1] === id
    },
    [stack],
  )

  const value = useMemo(
    () => ({
      register,
      unregister,
      isTopmost,
    }),
    [register, unregister, isTopmost],
  )

  return <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>
}

export function useModalStack() {
  const context = use(ModalStackContext)
  if (!context) {
    throw new Error('useModalStack must be used within ModalStackProvider')
  }
  return context
}
