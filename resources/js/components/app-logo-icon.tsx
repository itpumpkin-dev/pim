import { SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="10.4" y="1.5" width="3.2" height="6" rx="1.4" transform="rotate(18 12 4.5)" />
            <ellipse cx="7.2" cy="14.5" rx="3.4" ry="6.8" />
            <ellipse cx="10.6" cy="14.5" rx="3.4" ry="7.3" />
            <ellipse cx="14" cy="14.5" rx="3.4" ry="7.3" />
            <ellipse cx="17.2" cy="14.5" rx="3.4" ry="6.8" />
        </svg>
    );
}
