import { describe, expect, it } from 'vitest';
import { FIORI } from './fiori-style';
import { matchScoreTone, pendingRowSx, percentTone, syncDetailCardSx, syncPlatformCardSx, UI_BORDER, UI_BORDER_STRONG } from './ui-style';

describe('UI_BORDER / UI_BORDER_STRONG', () => {
    it('mirror the Fiori border tokens', () => {
        expect(UI_BORDER).toBe(FIORI.border);
        expect(UI_BORDER_STRONG).toBe(FIORI.borderStrong);
    });
});

describe('percentTone', () => {
    it('is success at/above the default high threshold (80)', () => {
        expect(percentTone(80)).toEqual({ bg: FIORI.successBg, fg: FIORI.success });
        expect(percentTone(100)).toEqual({ bg: FIORI.successBg, fg: FIORI.success });
    });

    it('is warning between the default mid (50) and high thresholds', () => {
        expect(percentTone(50)).toEqual({ bg: FIORI.warningBg, fg: FIORI.warning });
        expect(percentTone(79)).toEqual({ bg: FIORI.warningBg, fg: FIORI.warning });
    });

    it('is error below the default mid threshold', () => {
        expect(percentTone(49)).toEqual({ bg: FIORI.errorBg, fg: FIORI.error });
        expect(percentTone(0)).toEqual({ bg: FIORI.errorBg, fg: FIORI.error });
    });

    it('honors custom thresholds', () => {
        expect(percentTone(60, { high: 60, mid: 30 })).toEqual({ bg: FIORI.successBg, fg: FIORI.success });
        expect(percentTone(29, { high: 60, mid: 30 })).toEqual({ bg: FIORI.errorBg, fg: FIORI.error });
    });
});

describe('matchScoreTone', () => {
    it('is success at/above 70', () => {
        expect(matchScoreTone(70)).toEqual({ bg: FIORI.successBg, fg: FIORI.success, border: FIORI.success });
    });

    it('is warning between 40 and 69', () => {
        expect(matchScoreTone(40)).toEqual({ bg: FIORI.warningBg, fg: FIORI.warning, border: FIORI.warning });
        expect(matchScoreTone(69)).toEqual({ bg: FIORI.warningBg, fg: FIORI.warning, border: FIORI.warning });
    });

    it('is neutral below 40', () => {
        expect(matchScoreTone(39)).toEqual({ bg: FIORI.neutralBg, fg: FIORI.textSecondary, border: FIORI.border });
    });
});

describe('pendingRowSx', () => {
    it('returns a dashed warning border/background when there is a pending change', () => {
        const sx = pendingRowSx(true) as Record<string, unknown>;
        expect(sx.bgcolor).toBe(FIORI.warningBg);
        expect(sx.border).toContain(FIORI.warning);
    });

    it('returns a plain border color when there is no pending change', () => {
        const sx = pendingRowSx(false) as Record<string, unknown>;
        expect(sx.borderColor).toBe(FIORI.border);
        expect(sx.border).toBeUndefined();
    });
});

describe('syncPlatformCardSx', () => {
    it('uses the brand background/border when selected', () => {
        const sx = syncPlatformCardSx(true, false) as Record<string, unknown>;
        expect(sx.bgcolor).toBe(FIORI.brandBg);
        expect(sx.border).toBe(`2px solid ${FIORI.brand}`);
        expect(sx.cursor).toBe('pointer');
    });

    it('dims a disabled, unselected card and disables the pointer cursor', () => {
        const sx = syncPlatformCardSx(false, true) as Record<string, unknown>;
        expect(sx.opacity).toBe(0.6);
        expect(sx.cursor).toBe('default');
    });

    it('does not dim a disabled card that is still the selected one', () => {
        const sx = syncPlatformCardSx(true, true) as Record<string, unknown>;
        expect(sx.opacity).toBe(1);
    });
});

describe('syncDetailCardSx', () => {
    it('uses the regular border weight by default', () => {
        const sx = syncDetailCardSx() as Record<string, unknown>;
        expect(sx.border).toBe(`1px solid ${FIORI.border}`);
    });

    it('uses the strong border weight when asked', () => {
        const sx = syncDetailCardSx('strong') as Record<string, unknown>;
        expect(sx.border).toBe(`1px solid ${FIORI.borderStrong}`);
    });
});
