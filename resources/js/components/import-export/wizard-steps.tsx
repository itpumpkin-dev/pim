import { FIORI } from '@/lib/fiori-style';
import CheckIcon from '@mui/icons-material/Check';
import { Box, Stack, Typography } from '@mui/material';

export interface WizardStep {
    key: string;
    label: string;
}

interface Props {
    steps: WizardStep[];
    /** Index of the step currently shown. */
    active: number;
    /** Highest step index the user has reached — anything at or below is clickable. */
    furthest: number;
    onStepClick: (index: number) => void;
}

/**
 * SAP Fiori "Wizard" progress indicator — numbered nodes joined by a
 * connector, current node filled in the brand colour, completed nodes showing
 * a check. Visited steps are clickable so the user can jump back to change an
 * earlier choice.
 */
export default function WizardSteps({ steps, active, furthest, onStepClick }: Props) {
    return (
        <Stack direction="row" alignItems="flex-start" sx={{ width: '100%', overflowX: 'auto', py: 1 }}>
            {steps.map((step, index) => {
                const done = index < active;
                const current = index === active;
                const reachable = index <= furthest;

                return (
                    <Box
                        key={step.key}
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 96,
                            position: 'relative',
                        }}
                    >
                        {index > 0 && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 15,
                                    right: '50%',
                                    width: '100%',
                                    height: 2,
                                    bgcolor: index <= active ? FIORI.brand : FIORI.border,
                                }}
                            />
                        )}

                        <Box
                            onClick={() => reachable && onStepClick(index)}
                            sx={{
                                position: 'relative',
                                zIndex: 1,
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                cursor: reachable ? 'pointer' : 'default',
                                border: `2px solid ${current || done ? FIORI.brand : FIORI.borderStrong}`,
                                bgcolor: current ? FIORI.brand : done ? FIORI.brandBg : FIORI.surface,
                                color: current ? '#fff' : done ? FIORI.brand : FIORI.textSecondary,
                            }}
                        >
                            {done ? <CheckIcon sx={{ fontSize: 18 }} /> : index + 1}
                        </Box>

                        <Typography
                            variant="caption"
                            sx={{
                                mt: 0.75,
                                textAlign: 'center',
                                fontWeight: current ? 600 : 400,
                                color: current ? FIORI.textPrimary : FIORI.textSecondary,
                                px: 0.5,
                            }}
                        >
                            {step.label}
                        </Typography>
                    </Box>
                );
            })}
        </Stack>
    );
}
