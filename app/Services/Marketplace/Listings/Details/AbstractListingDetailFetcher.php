<?php

namespace App\Services\Marketplace\Listings\Details;

use Illuminate\Database\Eloquent\Model;

/**
 * Shared normalisation helpers for the per-platform listing detail fetchers
 * (see MarketplaceListingDetailFetcher for the output shape). Every helper is
 * defensive: a missing / wrongly-typed optional field yields null / [],
 * never an exception.
 */
abstract class AbstractListingDetailFetcher implements MarketplaceListingDetailFetcher
{
    /** factor → kilograms */
    private const WEIGHT_UNITS = [
        'kg' => 1.0, 'kilogram' => 1.0, 'kilograms' => 1.0,
        'g' => 0.001, 'gram' => 0.001, 'grams' => 0.001,
        'lb' => 0.45359237, 'lbs' => 0.45359237, 'pound' => 0.45359237, 'pounds' => 0.45359237,
        'oz' => 0.028349523125, 'ounce' => 0.028349523125,
    ];

    /** factor → centimetres */
    private const LENGTH_UNITS = [
        'cm' => 1.0, 'centimeter' => 1.0, 'centimetre' => 1.0,
        'mm' => 0.1, 'millimeter' => 0.1,
        'm' => 100.0, 'meter' => 100.0, 'metre' => 100.0,
        'in' => 2.54, 'inch' => 2.54, 'inches' => 2.54,
        'yd' => 91.44, 'yard' => 91.44,
    ];

    /**
     * Fills every key of the normalised shape (defaults for whatever the
     * platform parser didn't set).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function result(array $data): array
    {
        return [
            'name' => $data['name'] ?? null,
            'description' => $data['description'] ?? null,
            'description_text' => $data['description_text'] ?? null,
            'brand_id' => $data['brand_id'] ?? null,
            'brand_name' => $data['brand_name'] ?? null,
            'category_id' => $data['category_id'] ?? null,
            'category_name' => $data['category_name'] ?? null,
            'images' => array_values(array_unique(array_filter($data['images'] ?? [], fn ($u) => is_string($u) && $u !== ''))),
            'video_url' => $data['video_url'] ?? null,
            'attributes' => array_values($data['attributes'] ?? []),
            'package' => ($data['package'] ?? null) ?: $this->package(null, null, null, null),
            'variants' => array_values($data['variants'] ?? []),
            'status' => $data['status'] ?? null,
            'listing_url' => $data['listing_url'] ?? null,
            'raw' => $data['raw'] ?? [],
        ];
    }

    protected function str(mixed $value, ?int $max = null): ?string
    {
        if (! is_scalar($value) || is_bool($value)) {
            return null;
        }
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return $max !== null ? mb_substr($value, 0, $max) : $value;
    }

    protected function num(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    protected function arr(mixed $value): array
    {
        return is_array($value) ? $value : [];
    }

    /**
     * @return array{weight_kg: ?float, length_cm: ?float, width_cm: ?float, height_cm: ?float}
     */
    protected function package(?float $weightKg, ?float $lengthCm, ?float $widthCm, ?float $heightCm): array
    {
        $positive = fn (?float $v, int $precision) => $v !== null && $v > 0 ? round($v, $precision) : null;

        return [
            'weight_kg' => $positive($weightKg, 3),
            'length_cm' => $positive($lengthCm, 2),
            'width_cm' => $positive($widthCm, 2),
            'height_cm' => $positive($heightCm, 2),
        ];
    }

    /** null when the value isn't numeric or the unit is unknown */
    protected function toKg(mixed $value, ?string $unit): ?float
    {
        $factor = self::WEIGHT_UNITS[strtolower(trim((string) $unit))] ?? null;

        return is_numeric($value) && $factor !== null ? (float) $value * $factor : null;
    }

    protected function toCm(mixed $value, ?string $unit): ?float
    {
        $factor = self::LENGTH_UNITS[strtolower(trim((string) $unit))] ?? null;

        return is_numeric($value) && $factor !== null ? (float) $value * $factor : null;
    }

    /**
     * @param  array<string, string>  $options  option name => value
     * @return array{variant_id: string, seller_sku: ?string, name: ?string, options: array<string, string>, price: ?float, special_price: ?float, quantity: ?int, status: ?string, image: ?string}
     */
    protected function variant(mixed $variantId, mixed $sellerSku, array $options, mixed $price, mixed $specialPrice, mixed $quantity, mixed $status, mixed $image): array
    {
        $price = $this->num($price);
        $special = $this->num($specialPrice);
        // a "special" price equal to the normal one (Lazada/Shopee send both) isn't one
        if ($special !== null && ($special <= 0 || ($price !== null && abs($special - $price) < 0.005))) {
            $special = null;
        }
        $options = array_filter(array_map(fn ($v) => $this->str($v), $options), fn ($v) => $v !== null);

        return [
            'variant_id' => (string) ($this->str($variantId) ?? ''),
            'seller_sku' => $this->str($sellerSku, 255),
            'name' => $options !== [] ? implode(' / ', $options) : null,
            'options' => $options,
            'price' => $price !== null ? round($price, 2) : null,
            'special_price' => $special !== null ? round($special, 2) : null,
            'quantity' => is_numeric($quantity) ? (int) $quantity : null,
            'status' => $this->str($status),
            'image' => $this->str($image),
        ];
    }

    /**
     * @param  array<int, mixed>  $values
     * @return array{id: ?string, name: string, values: list<string>}|null null when it has no name or no value
     */
    protected function attribute(mixed $id, mixed $name, array $values): ?array
    {
        $name = $this->str($name);
        $values = array_values(array_filter(array_map(fn ($v) => $this->str($v), $values), fn ($v) => $v !== null));
        if ($name === null || $values === []) {
            return null;
        }

        return ['id' => $this->str($id), 'name' => $name, 'values' => $values];
    }

    /**
     * Name of a platform category from our own synced category table
     * (lazada_categories / shopee_categories — free, no API call); null when
     * not synced.
     *
     * @param  class-string<Model>  $model
     */
    protected function localCategoryName(string $model, ?string $categoryId, array $columns = ['name']): ?string
    {
        if ($categoryId === null || ! ctype_digit($categoryId)) {
            return null;
        }

        try {
            $row = $model::query()->find((int) $categoryId);
        } catch (\Throwable) {
            return null;
        }
        foreach ($columns as $column) {
            if ($row !== null && ($value = $this->str($row->{$column})) !== null) {
                return $value;
            }
        }

        return null;
    }

    /**
     * Marketplace HTML → readable plain text: block ends / <br> become line
     * breaks, list items get a "• " bullet, tags are stripped, entities
     * decoded, whitespace tidied (≤ 1 blank line in a row). Plain text input
     * keeps its own line breaks. Never use the result as HTML.
     */
    public static function htmlToText(?string $html): ?string
    {
        if ($html === null || trim($html) === '') {
            return null;
        }

        $s = str_replace(["\r\n", "\r"], "\n", $html);
        if (preg_match('/<[a-z!\/][^>]*>/i', $s)) {
            // in HTML, source newlines are just whitespace
            $s = (string) preg_replace('#<(script|style|head|title)\b[^>]*>.*?</\1\s*>#is', '', $s);
            $s = str_replace("\n", ' ', $s);
            $s = (string) preg_replace('#<br\s*/?>#i', "\n", $s);
            $s = (string) preg_replace('#<li\b[^>]*>#i', "\n• ", $s);
            $s = (string) preg_replace('#</li\s*>#i', '', $s);
            $s = (string) preg_replace('#</t[dh]\s*>#i', '  ', $s);
            $s = (string) preg_replace('#</(ul|ol|table)\s*>#i', "\n\n", $s);
            $s = (string) preg_replace('#</(p|div|h[1-6]|tr|section|article|blockquote|pre)\s*>#i', "\n", $s);
            $s = (string) preg_replace('#<(hr)\b[^>]*>#i', "\n", $s);
            $s = strip_tags($s);
        }

        $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $s = str_replace(["\u{00A0}", "\u{200B}"], [' ', ''], $s);
        $lines = array_map(fn ($line) => trim((string) preg_replace('/[ \t]+/u', ' ', $line)), explode("\n", $s));
        $s = (string) preg_replace("/\n{3,}/", "\n\n", implode("\n", $lines));
        // <li><p>..</p></li> leaves a blank line between bullets — keep a list tight
        $s = (string) preg_replace("/^(• [^\n]*)\n\n(?=• )/mu", "$1\n", $s);
        $s = trim($s);

        return $s === '' ? null : $s;
    }

    /** Joins non-empty text blocks with a blank line. */
    protected function joinText(?string ...$parts): ?string
    {
        $parts = array_values(array_filter($parts, fn ($p) => $p !== null && trim($p) !== ''));

        return $parts === [] ? null : implode("\n\n", $parts);
    }
}
