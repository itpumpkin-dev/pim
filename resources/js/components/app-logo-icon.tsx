import pumpkin from '../../images/logo_land.png';
import { ImgHTMLAttributes } from 'react';

export default function AppLogoIcon({ style, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    return <img src={pumpkin} alt="PIM Pumpkin" style={{ objectFit: 'contain', ...style }} {...props} />;
}
