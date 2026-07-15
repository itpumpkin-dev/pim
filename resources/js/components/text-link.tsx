import { Link as InertiaLink } from '@inertiajs/react';
import { Link as MuiLink } from '@mui/material';
import { ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof InertiaLink>;

export default function TextLink({ children, ...props }: LinkProps) {
    return (
        <MuiLink component={InertiaLink} underline="hover" {...props}>
            {children}
        </MuiLink>
    );
}
