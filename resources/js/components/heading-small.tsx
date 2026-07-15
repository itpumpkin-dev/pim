import { Box, Typography } from '@mui/material';

export default function HeadingSmall({ title, description }: { title: string; description?: string }) {
    return (
        <Box component="header">
            <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
                {title}
            </Typography>
            {description && (
                <Typography variant="body2" color="text.secondary">
                    {description}
                </Typography>
            )}
        </Box>
    );
}
