import { useModalStack } from '@/context/ModalStackContext'
import { useEffect, useId } from 'react'
import BootstrapModal from 'react-bootstrap/Modal'
import type { ModalProps } from 'react-bootstrap/Modal'

function AppModal({ show, backdrop, keyboard, enforceFocus, className, ...rest }: ModalProps) {
  const modalId = useId()
  const { register, unregister, isTopmost } = useModalStack()

  useEffect(() => {
    if (!show) return
    register(modalId)
    return () => unregister(modalId)
  }, [show, modalId, register, unregister])

  const topmost = isTopmost(modalId)
  const buried = show && !topmost

  const mergedClassName = [className, buried ? 'modal-stack-buried' : undefined].filter(Boolean).join(' ') || undefined

  return (
    <BootstrapModal
      {...rest}
      show={show}
      className={mergedClassName}
      backdrop={buried ? false : backdrop}
      keyboard={buried ? false : keyboard}
      enforceFocus={buried ? false : enforceFocus}
    />
  )
}

AppModal.Header = BootstrapModal.Header
AppModal.Body = BootstrapModal.Body
AppModal.Footer = BootstrapModal.Footer
AppModal.Title = BootstrapModal.Title
AppModal.Dialog = BootstrapModal.Dialog

export default AppModal
