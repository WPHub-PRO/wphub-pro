
import { usePlatformBranding } from '@/context/PlatformBrandingContext'
import {Link} from "react-router";

const AppLogo = ({ height }: { height?: number }) => {
  const branding = usePlatformBranding()
  const h = height ?? 28
  return (
    <>
      <Link to="/" className="logo-dark">
        <img src={branding.logoDarkSrc} alt="" height={h} />
      </Link>
      <Link to="/" className="logo-light">
        <img src={branding.logoLightSrc} alt="" height={h} />
      </Link>
    </>
  )
}

export default AppLogo
