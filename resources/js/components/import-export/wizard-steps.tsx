import '@ui5/webcomponents-icons/dist/accept.js';
import { Icon } from '@ui5/webcomponents-react';

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
 *
 * Kept as a custom header (not the UI5 `Wizard`) because the UI5 Wizard owns
 * the step content + scrolling, while the import page renders each step's
 * content itself and only needs the progress header.
 */
export default function WizardSteps({ steps, active, furthest, onStepClick }: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%', overflowX: 'auto', padding: '0.5rem 0' }}>
            {steps.map((step, index) => {
                const done = index < active;
                const current = index === active;
                const reachable = index <= furthest;

                return (
                    <div
                        key={step.key}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 96,
                            position: 'relative',
                        }}
                    >
                        {index > 0 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 15,
                                    right: '50%',
                                    width: '100%',
                                    height: 2,
                                    background: index <= active ? 'var(--sapBrandColor)' : 'var(--sapGroup_ContentBorderColor)',
                                }}
                            />
                        )}

                        <div
                            role={reachable ? 'button' : undefined}
                            tabIndex={reachable ? 0 : undefined}
                            aria-current={current ? 'step' : undefined}
                            onClick={() => reachable && onStepClick(index)}
                            onKeyDown={(e) => {
                                if (reachable && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    onStepClick(index);
                                }
                            }}
                            style={{
                                position: 'relative',
                                zIndex: 1,
                                width: 32,
                                height: 32,
                                boxSizing: 'border-box',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                fontFamily: 'var(--sapFontFamily)',
                                cursor: reachable ? 'pointer' : 'default',
                                border: `2px solid ${current || done ? 'var(--sapBrandColor)' : 'var(--sapField_BorderColor)'}`,
                                background: current
                                    ? 'var(--sapBrandColor)'
                                    : done
                                      ? 'var(--sapSelectedColor, var(--sapList_SelectionBackgroundColor))'
                                      : 'var(--sapGroup_ContentBackground)',
                                color: current
                                    ? 'var(--sapContent_ContrastTextColor, #fff)'
                                    : done
                                      ? 'var(--sapBrandColor)'
                                      : 'var(--sapContent_LabelColor)',
                            }}
                        >
                            {done ? <Icon name="accept" style={{ width: 18, height: 18, color: 'var(--sapBrandColor)' }} /> : index + 1}
                        </div>

                        <span
                            style={{
                                marginTop: '0.375rem',
                                textAlign: 'center',
                                fontFamily: 'var(--sapFontFamily)',
                                fontSize: 'var(--sapFontSmallSize)',
                                fontWeight: current ? 600 : 400,
                                color: current ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)',
                                padding: '0 0.25rem',
                            }}
                        >
                            {step.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
