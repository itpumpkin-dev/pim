<?php

namespace App\Services\Marketplace\Listings;

use App\Models\Attribute;
use Illuminate\Support\Facades\DB;

/**
 * Brand names / aliases for the score-based matcher (phase 3A): the options
 * of the `pbrand` select attribute (code → admin_label + every locale label)
 * plus a few hand-written spellings sellers use. Detects which brand a
 * listing / product name mentions and groups brands into "families"
 * (PUMPKIN, PUMPKIN-PRO, PUMPKIN HOME … → pumpkin).
 *
 * Catch-all options (premium/raw material/spare part/other …) are not
 * brands and are left out, as are aliases shorter than 3 characters.
 */
class BrandDictionary
{
    /** extra spellings seen in listing titles, by brand option code */
    public const EXTRA_ALIASES = [
        'pumpkin' => ['พัมคิน', 'พัมพ์คิน', 'ฟักทอง'],
        'je_tech' => ['jetech'],
        'texus_bull' => ['texusbull'],
        'texas_bull' => ['texasbull'],
    ];

    /** option codes that are categories of goods, not brands */
    private const NOT_BRANDS = ['customer_brand'];

    /** @var array<string, string> normalised alias => brand code, longest alias first */
    private array $aliases = [];

    /**
     * @param  array<string, array{label: string, aliases?: list<string>}>  $brands  code => label (+ aliases)
     */
    public function __construct(private readonly array $brands)
    {
        $aliases = [];
        foreach ($brands as $code => $brand) {
            foreach ([$brand['label'], str_replace('_', ' ', $code), ...($brand['aliases'] ?? []), ...(self::EXTRA_ALIASES[$code] ?? [])] as $alias) {
                $norm = MatchText::brandSpacing((string) $alias);
                if (mb_strlen($norm) >= 3 && ! isset($aliases[$norm])) {
                    $aliases[$norm] = $code;
                }
            }
        }
        uksort($aliases, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a) ?: strcmp($a, $b));
        $this->aliases = $aliases;
    }

    public static function fromDatabase(): self
    {
        $attributeId = Attribute::idForCode('pbrand');
        if (! $attributeId) {
            return new self([]);
        }

        $brands = [];
        $options = DB::table('attribute_options')->where('attribute_id', $attributeId)->get(['id', 'code', 'admin_label']);
        $translations = DB::table('attribute_option_translations')
            ->whereIn('attribute_option_id', $options->pluck('id'))
            ->get(['attribute_option_id', 'label'])
            ->groupBy('attribute_option_id');

        foreach ($options as $option) {
            $code = (string) $option->code;
            if (str_starts_with($code, 'brand_') || in_array($code, self::NOT_BRANDS, true)) {
                continue;
            }
            $brands[$code] = [
                'label' => (string) ($option->admin_label ?: $code),
                'aliases' => $translations->get($option->id, collect())->pluck('label')->filter()->values()->all(),
            ];
        }

        return new self($brands);
    }

    /** @return list<string> normalised aliases, longest first (for MatchText::normalizeName) */
    public function aliases(): array
    {
        return array_keys($this->aliases);
    }

    public function label(?string $code): ?string
    {
        return $code === null ? null : ($this->brands[$code]['label'] ?? $code);
    }

    public function has(?string $code): bool
    {
        return $code !== null && isset($this->brands[$code]);
    }

    /** first word of the label: PUMPKIN-PRO / PUMPKIN HOME → "pumpkin" */
    public function family(?string $code): ?string
    {
        $label = $this->label($code);
        if ($label === null) {
            return null;
        }

        return explode(' ', MatchText::brandSpacing($label))[0] ?: null;
    }

    /**
     * The brand a text names: the alias occurring earliest, longest alias
     * winning at the same position ("PUMPKIN PRO …" → pumpkin_pro).
     */
    public function detect(?string $text): ?string
    {
        $s = MatchText::brandSpacing(MatchText::spaceScripts((string) $text));
        if ($s === '') {
            return null;
        }

        $best = null;
        $bestPos = PHP_INT_MAX;
        foreach ($this->aliases as $alias => $code) {
            if (preg_match(MatchText::aliasPattern($alias), $s, $m, PREG_OFFSET_CAPTURE) && $m[0][1] < $bestPos) {
                // aliases are iterated longest-first, so a strictly earlier
                // position is needed to replace a longer alias found before
                $best = $code;
                $bestPos = $m[0][1];
            }
        }

        return $best;
    }
}
