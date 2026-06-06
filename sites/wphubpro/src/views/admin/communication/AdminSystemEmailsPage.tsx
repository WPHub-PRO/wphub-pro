import PageMetaData from '@/components/PageMetaData'
import SystemEmailBuilderTab from '@/views/admin/communication/SystemEmailBuilderTab'

const AdminSystemEmailsPage = () => {
  return (
    <>
      <PageMetaData title="System e-mails · Admin" />
      <SystemEmailBuilderTab />
    </>
  )
}

export default AdminSystemEmailsPage
