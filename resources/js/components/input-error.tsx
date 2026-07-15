import { Typography, type TypographyProps } from '@mui/material';

export default function InputError({ message, ...props }: TypographyProps & { message?: string }) {
    return message ? (
        <Typography variant="body2" color="error" {...props}>
            {message}
        </Typography>
    ) : null;
}
