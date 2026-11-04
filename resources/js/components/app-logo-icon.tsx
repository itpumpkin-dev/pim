import { ImgHTMLAttributes } from 'react';
import pumpkin from '../../images/logo_land.png';

export default function AppLogoIcon({ style, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    return <img src={pumpkin} alt="PIM Pumpkin" style={{ objectFit: 'contain', ...style }} {...props} />;
}
