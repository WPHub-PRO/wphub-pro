import { usePlatformBranding } from '@/context/PlatformBrandingContext'

type PageMetaDataProps = {
  title: string
  description?: string
  keywords?: string
}

const defaultKeywords =
  'WP Hub Pro, WordPress, admin, sites, billing, teams, Appwrite, dashboard, hub'

const PageMetaData = ({
  title,
  description,
  keywords = defaultKeywords,
}: PageMetaDataProps) => {
  const branding = usePlatformBranding()
  const siteName = branding.displaySiteName
  const metaDescription = description ?? branding.metaDescription
  const pageTitle = title.trim()

  return (
    <>
      <title>{pageTitle ? `${pageTitle} | ${siteName}` : siteName}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={keywords} />
    </>
  )
}
export default PageMetaData
