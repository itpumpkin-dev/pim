import { Link as InertiaLink } from '@inertiajs/react';
import { ComponentProps } from 'react';

import styles from './text-link.module.css';

type LinkProps = ComponentProps<typeof InertiaLink>;

/** Inertia link styled like a Fiori (UI5) Link — brand colour, underline on hover. */
export default function TextLink({ children, className, ...props }: LinkProps) {
    return (
        <InertiaLink className={[styles.link, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </InertiaLink>
    );
}
