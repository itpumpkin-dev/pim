<?php

namespace App\Services\Marketplace\Listings;

use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaCategoryAttribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeCategoryAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokCategoryAttribute;
use App\Models\User;
use App\Models\WooCommerceAttributeMapping;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * "นำเข้าและแก้ไขข้อมูลจาก {platform}" (Product Mapping object page): an edit
 * form for the PIM values a platform push uses, laid out like that platform's
 * own seller-centre form (row `group` = sub-tab), with the linked listing's
 * value (marketplace_listing_details) next to each field when there is one.
 *
 * Fields come from the platform mappings:
 *  - payload fields (name / description / weight / length / width / height) →
 *    the first PIM attribute mapped to that target_field (same "first by
 *    sort_order" the push resolves); price / qty / video are not edited here;
 *  - brand → `pbrand` (the listing's brand resolved via brands.{platform}_brand_id);
 *  - platform attributes → their {platform}_attribute mappings, for the
 *    attributes of the product's platform category plus any on the listing;
 *    select / multiselect values go back through the option mappings.
 *
 * Writes (PIM only — pushing stays a separate step): a channel-based attribute
 * is written for the chosen shop's channel, any other attribute to the default
 * (all channels); locale th for locale-based attributes; the attribute group the
 * push / edit page read (primaryGroupIdFor()); per-attribute edit permission;
 * one audit entry; no marketplace auto-sync.
 */
class ListingImportService
{
    public const IMPORT_LOCALE = 'th';

    public const PLATFORMS = ['shopee', 'lazada', 'tiktok', 'woocommerce'];

    private const PAYLOAD_FIELDS = [
        'name' => 'ชื่อสินค้า',
        'description' => 'คำอธิบายสินค้า',
        'weight' => 'น้ำหนัก (kg)',
        'length' => 'ความยาว (cm)',
        'width' => 'ความกว้าง (cm)',
        'height' => 'ความสูง (cm)',
    ];

    private const PACKAGE_KEYS = ['weight' => 'weight_kg', 'length' => 'length_cm', 'width' => 'width_cm', 'height' => 'height_cm'];

    /** platform => [mapping model, ref column, platform-attribute target_field, option mapping model, its FK, option column prefix, category-attribute model, its ref column] */
    private const MAPPINGS = [
        'shopee' => [ShopeeAttributeMapping::class, 'shopee_attribute_id', 'shopee_attribute', ShopeeAttributeOptionMapping::class, 'shopee_attribute_mapping_id', 'shopee_option', ShopeeCategoryAttribute::class, 'shopee_attribute_id'],
        'lazada' => [LazadaAttributeMapping::class, 'lazada_attribute_name', 'lazada_attribute', LazadaAttributeOptionMapping::class, 'lazada_attribute_mapping_id', 'lazada_option', LazadaCategoryAttribute::class, 'lazada_attribute_name'],
        'tiktok' => [TikTokAttributeMapping::class, 'tiktok_attribute_id', 'tiktok_attribute', TikTokAttributeOptionMapping::class, 'tiktok_attribute_mapping_id', 'tiktok_option', TikTokCategoryAttribute::class, 'tiktok_attribute_id'],
        'woocommerce' => [WooCommerceAttributeMapping::class, 'woocommerce_attribute_id', 'wc_attribute', null, null, null, null, null],
    ];

    /** sub-tab of each kind of field, per platform (matches the frontend tab list) */
    private const GROUPS = [
        'shopee' => ['name' => 'general', 'description' => 'details', 'package' => 'shipping', 'brand' => 'specs', 'attribute' => 'specs', 'key_attribute' => 'specs', 'warranty' => 'specs', 'other' => 'other'],
        'lazada' => ['name' => 'general', 'description' => 'details', 'package' => 'shipping', 'brand' => 'key', 'attribute' => 'specs', 'key_attribute' => 'key', 'warranty' => 'shipping', 'other' => 'specs'],
        'tiktok' => ['name' => 'basic', 'description' => 'details', 'package' => 'shipping', 'brand' => 'basic', 'attribute' => 'details', 'key_attribute' => 'details', 'warranty' => 'details', 'other' => 'details'],
        'woocommerce' => ['name' => 'general', 'description' => 'description', 'package' => 'shipping', 'brand' => 'general', 'attribute' => 'attributes', 'key_attribute' => 'attributes', 'warranty' => 'attributes', 'other' => 'attributes'],
    ];

    /**
     * Fields each platform's own product form makes mandatory (beyond the
     * category attributes, whose `mandatory` flag comes from the platform) —
     * brand on every platform because MarketplaceSyncGate::brandMapped() blocks
     * the push without one.
     */
    private const REQUIRED_FIELDS = [
        'shopee' => ['name', 'description', 'weight', 'brand'],
        'lazada' => ['name', 'description', 'weight', 'length', 'width', 'height', 'brand'],
        'tiktok' => ['name', 'description', 'weight', 'brand'],
        'woocommerce' => ['name', 'brand'],
    ];

    /** PIM attribute types this form can edit */
    private const WRITABLE_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect'];

    private const ALLOWED_HTML = '<p><br><ul><ol><li><strong><b><em><i><u><h2><h3><h4><table><thead><tbody><tr><th><td>';

    public function __construct(
        private readonly EffectiveFamilyAttributeResolver $families,
        private readonly AttributeAccessPolicy $access,
    ) {}

    public static function platformOf(MarketplaceListing $listing): ?string
    {
        $key = MarketplaceListingFetcherResolver::platformKey($listing->shop) ?? $listing->platform;

        return in_array($key, self::PLATFORMS, true) ? $key : null;
    }

    /** the listing is linked to this product (or one of its variants) directly — bundles can't be used */
    public static function listingBelongsTo(MarketplaceListing $listing, Product $product): bool
    {
        if ($listing->product_id === null) {
            return false;
        }

        return $listing->product_id === $product->id
            || Product::whereKey($listing->product_id)->where('parent_id', $product->id)->exists();
    }

    /**
     * @param  ?int  $platformCategoryId  the product's mapped platform category (its attributes are offered even without a listing)
     * @return list<array<string, mixed>>
     */
    public function plan(Product $product, string $platform, ?MarketplaceListing $listing, ?MarketplaceListingDetail $detail, ?int $platformCategoryId, ?User $user): array
    {
        if (! in_array($platform, self::PLATFORMS, true)) {
            throw new InvalidArgumentException("Unknown platform '{$platform}'.");
        }
        [$mappingModel, $refColumn, $attributeTarget, , , , $categoryModel, $categoryRef] = self::MAPPINGS[$platform];
        $groups = self::GROUPS[$platform];
        $detail = $detail?->hasData() ? $detail : null;

        $mappings = $mappingModel::with('attribute')->orderBy('sort_order')->orderBy('id')->get();
        $context = $this->context($product, $listing);
        $rows = [];

        // 1) payload fields
        foreach (self::PAYLOAD_FIELDS as $field => $label) {
            $mapping = $mappings->first(fn ($m) => $m->target_field === $field && $m->attribute);
            $proposed = $detail === null ? null : match ($field) {
                'name' => $detail->name,
                'description' => $this->descriptionHtml($detail),
                default => $this->number((string) ($detail->package[self::PACKAGE_KEYS[$field]] ?? ''))[0],
            };
            $group = $groups[in_array($field, ['name', 'description'], true) ? $field : 'package'];
            $row = $this->row("field:{$field}", $group, $label, $mapping?->attribute, $proposed, null, $context, $user, $mapping === null);
            $row['required'] = in_array($field, self::REQUIRED_FIELDS[$platform], true);
            $rows[] = $row;
        }

        // 2) brand
        $brandAttribute = Attribute::where('code', 'pbrand')->first();
        if ($brandAttribute) {
            $brand = $detail ? $this->brandFor($platform, $detail) : null;
            $proposed = $brand?->code;
            $hint = $detail && ($detail->brand_name || $detail->brand_id) && $brand === null
                ? 'แบรนด์บนร้าน "'.($detail->brand_name ?? $detail->brand_id).'" ยังไม่ได้แมพกับแบรนด์ใน PIM'
                : null;
            $row = $this->row('brand', $groups['brand'], 'แบรนด์', $brandAttribute, $proposed, $detail?->brand_name, $context, $user, false);
            $row['hint'] = $hint;
            $row['required'] = in_array('brand', self::REQUIRED_FIELDS[$platform], true);
            $rows[] = $row;
        }

        // 3) platform attributes — category attributes (+ mandatory flag) ∪ the listing's attributes
        $attributeMappings = $mappings->where('target_field', $attributeTarget)->filter(fn ($m) => $m->attribute)
            ->keyBy(fn ($m) => (string) $m->{$refColumn});
        $categoryAttributes = $categoryModel && $platformCategoryId
            ? $categoryModel::where('category_id', $platformCategoryId)->get([$categoryRef, 'mandatory'])->keyBy(fn ($c) => (string) $c->{$categoryRef})
            : collect();
        $listingAttributes = collect($detail?->getAttribute('attributes') ?? [])->keyBy(fn ($a) => (string) ($a['id'] ?? ''));

        $ids = $platform === 'woocommerce'
            ? $attributeMappings->keys()->merge($listingAttributes->keys())->unique()
            : $categoryAttributes->keys()->merge($listingAttributes->keys())->unique();

        foreach ($ids as $id) {
            if ($id === '') {
                continue;
            }
            $mapping = $attributeMappings->get($id);
            $listingAttribute = $listingAttributes->get($id);
            $values = array_values(array_filter((array) ($listingAttribute['values'] ?? []), fn ($v) => $v !== null && $v !== ''));
            $label = (string) ($listingAttribute['name'] ?? $mapping?->attribute?->name ?? $id);
            $mandatory = (bool) ($categoryAttributes->get($id)?->mandatory ?? false);
            $kind = Str::contains(Str::lower($label.' '.$id), ['warranty', 'รับประกัน']) ? 'warranty'
                : ($mandatory ? 'key_attribute' : 'attribute');

            if ($mapping === null) {
                if ($listingAttribute !== null) {
                    $row = $this->row("attr:{$id}", $groups['other'], $label, null, null, implode(', ', $values), $context, $user, true);
                    $row['required'] = $mandatory;
                    $rows[] = $row;
                }

                continue;
            }

            [$proposed, $error] = $values === [] ? [null, null] : $this->convert($mapping->attribute, $values, $platform, $mapping);
            $row = $this->row("attr:{$id}", $groups[$kind], $label, $mapping->attribute, $proposed, implode(', ', $values), $context, $user, false);
            if ($error !== null) {
                $row['hint'] = $error;
            }
            $row['required'] = $mandatory;
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * Saves edited values (only keys whose row is editable) — validated per
     * type; an empty value clears that scope's value.
     *
     * @param  array<string, mixed>  $values  row key => new value (multiselect: list of codes)
     * @return array{written: int, skipped: list<string>, errors: array<string, string>}
     */
    public function apply(Product $product, string $platform, ?MarketplaceListing $listing, ?MarketplaceListingDetail $detail, ?int $platformCategoryId, array $values, ?User $user): array
    {
        $rows = collect($this->plan($product, $platform, $listing, $detail, $platformCategoryId, $user))->keyBy('key');
        $context = $this->context($product, $listing);
        $changes = [];
        $skipped = [];
        $errors = [];

        foreach ($values as $key => $value) {
            $row = $rows->get($key);
            if ($row === null || ! $row['editable']) {
                $skipped[] = (string) $key;

                continue;
            }
            try {
                $stored = $this->normalise($row, $value);
            } catch (InvalidArgumentException $e) {
                $errors[(string) $key] = $e->getMessage();

                continue;
            }
            if ($stored === $row['current'] || ($stored === null && ($row['current'] === null || $row['current'] === ''))) {
                continue;
            }
            $changes[] = ['row' => $row, 'value' => $stored];
        }

        if ($errors !== [] || $changes === []) {
            return ['written' => 0, 'skipped' => $skipped, 'errors' => $errors];
        }

        DB::transaction(function () use ($product, $listing, $platform, $context, $changes) {
            $old = [];
            $new = [];
            foreach ($changes as ['row' => $row, 'value' => $value]) {
                $attribute = $row['attribute'];
                $keys = [
                    'product_id' => $product->id,
                    'attribute_id' => $attribute['id'],
                    'attribute_group_id' => $this->families->primaryGroupIdFor($attribute['id'], $context['family_ids']),
                    'channel_id' => $row['scope'] === 'channel' ? $context['channel_id'] : null,
                    'locale_id' => $attribute['is_locale_based'] ? $context['locale_id'] : null,
                ];
                $label = $attribute['code'].($keys['channel_id'] ? "[channel:{$keys['channel_id']}]" : '');
                $old[$label] = ProductValue::where($keys)->value('value');
                if ($value === null) {
                    ProductValue::where($keys)->delete();
                } else {
                    ProductValue::updateOrCreate($keys, ['value' => $value]);
                }
                $new[$label] = $value;
            }

            AuditLog::record('marketplace_product_edited', $product, $old, $new + [
                '_source' => $listing ? "{$listing->shop->name} · item {$listing->item_id}" : "หน้า Map สินค้า ({$platform})",
            ]);
            $product->touch();
        });

        event(new ProductDataChanged($product->id, (bool) $product->enabled, skipMarketplaceAutoSync: true));

        return ['written' => count($changes), 'skipped' => $skipped, 'errors' => []];
    }

    /** @return array{product_id: int, channel_id: ?int, locale_id: ?int, family_ids: list<int>} */
    private function context(Product $product, ?MarketplaceListing $listing): array
    {
        return [
            'product_id' => $product->id,
            // no listing = no shop to scope to → channel-based values fall back to the default
            'channel_id' => $listing?->shop?->channel_id,
            'locale_id' => Locale::where('code', self::IMPORT_LOCALE)->value('id'),
            'family_ids' => $this->families->effectiveFamilyIds($product),
        ];
    }

    /**
     * One form field: current PIM value (for its scope), the listing's value,
     * the control type + options, and whether it can be edited.
     */
    private function row(string $key, string $group, string $label, ?Attribute $attribute, mixed $proposed, ?string $source, array $context, ?User $user, bool $unmapped): array
    {
        $proposed = $proposed === null || $proposed === '' ? null : (string) $proposed;
        $base = [
            'key' => $key,
            'group' => $group,
            'label' => $label,
            'attribute' => $attribute ? [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'name' => $attribute->name,
                'type' => $attribute->type,
                'is_channel_based' => (bool) $attribute->is_channel_based,
                'is_locale_based' => (bool) $attribute->is_locale_based,
            ] : null,
            'scope' => $attribute ? ($attribute->is_channel_based && $context['channel_id'] ? 'channel' : 'default') : null,
            'current' => null,
            'proposed' => $proposed,
            'source' => $source ?? $proposed,
            'options' => [],
            'editable' => false,
            'required' => false,
            'status' => 'ok',
            'reason' => null,
            'hint' => null,
            'differs' => false,
        ];

        if ($unmapped || $attribute === null) {
            return ['status' => 'unmapped', 'reason' => 'ยังไม่ได้แมพกับ PIM attribute'] + $base;
        }
        if (! in_array($attribute->type, self::WRITABLE_TYPES, true)) {
            return ['status' => 'unsupported', 'reason' => "ยังไม่รองรับ attribute ประเภท {$attribute->type}"] + $base;
        }

        $groupId = $this->families->primaryGroupIdFor($attribute->id, $context['family_ids']);
        if ($groupId === null) {
            return ['status' => 'not_in_family', 'reason' => 'attribute นี้ไม่อยู่ในตระกูล (family) ของสินค้า'] + $base;
        }

        // ค่าปัจจุบันใน PIM: attribute แยกภาษาใช้ th → แถว NULL (ข้อมูลเก่า) ตาม LocaleFallback
        $lookup = fn (?int $channelId) => ProductValue::where('product_id', $context['product_id'])
            ->where('attribute_id', $attribute->id)->where('attribute_group_id', $groupId)
            ->where('channel_id', $channelId)
            ->when($attribute->is_locale_based, fn ($q) => $q->inLocale($context['locale_id']), fn ($q) => $q->whereNull('locale_id'))
            ->value('value');
        $current = $base['scope'] === 'channel' ? ($lookup($context['channel_id']) ?? $lookup(null)) : $lookup(null);
        $base['current'] = $current;
        $base['differs'] = $proposed !== null && ! $this->same($attribute->type, $current, $proposed);

        if (in_array($attribute->type, ['select', 'multiselect'], true)) {
            $base['options'] = AttributeOption::where('attribute_id', $attribute->id)->where(fn ($q) => $q->where('is_active', true)->orWhereNull('is_active'))
                ->orderBy('sort_order')->orderBy('id')->get(['code', 'admin_label'])
                ->map(fn (AttributeOption $o) => ['value' => $o->code, 'label' => $o->admin_label ?: $o->code])->values()->all();
        }

        if (! $this->access->canEditAttributeAcrossFamilies($user, $attribute)) {
            return ['status' => 'no_permission', 'reason' => 'ไม่มีสิทธิ์แก้ไข attribute นี้'] + $base;
        }

        return ['editable' => true] + $base;
    }

    /** edited form value → stored value (null = clear) */
    private function normalise(array $row, mixed $value): ?string
    {
        $type = $row['attribute']['type'];
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        return match ($type) {
            'number' => $this->number((string) $value)[0] ?? throw new InvalidArgumentException("\"{$value}\" ไม่ใช่ตัวเลข"),
            // edited in our own RichTextEditor — keep its markup (links, images, inline
            // styles) like the product edit page does; only drop what can run script
            'textarea' => $this->stripActiveContent((string) $value),
            'select' => in_array((string) $value, array_column($row['options'], 'value'), true)
                ? (string) $value
                : throw new InvalidArgumentException('ตัวเลือกไม่ถูกต้อง'),
            'multiselect' => (function () use ($value, $row) {
                $codes = is_array($value) ? $value : (json_decode((string) $value, true) ?? []);
                $codes = array_values(array_unique(array_map('strval', (array) $codes)));
                if (array_diff($codes, array_column($row['options'], 'value')) !== []) {
                    throw new InvalidArgumentException('ตัวเลือกไม่ถูกต้อง');
                }

                return $codes === [] ? null : json_encode($codes, JSON_UNESCAPED_UNICODE);
            })(),
            default => trim((string) $value) === '' ? null : trim((string) $value),
        };
    }

    private function same(string $type, ?string $current, ?string $proposed): bool
    {
        if ($current === null || $proposed === null) {
            return false;
        }
        if ($type === 'number') {
            return is_numeric($current) && is_numeric($proposed) && (float) $current === (float) $proposed;
        }
        if ($type === 'multiselect') {
            $a = json_decode($current, true) ?: [];
            $b = json_decode($proposed, true) ?: [];
            sort($a);
            sort($b);

            return $a === $b;
        }
        if ($type === 'textarea') {
            return $this->plain($current) === $this->plain($proposed);
        }

        return trim($current) === trim($proposed);
    }

    private function plain(string $html): string
    {
        return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>', '<br />'], "\n", $html)))));
    }

    /**
     * platform values → stored PIM value
     *
     * @param  list<string>  $values
     * @return array{0: ?string, 1: ?string} [stored value, error]
     */
    private function convert(Attribute $attribute, array $values, string $platform, object $mapping): array
    {
        return match ($attribute->type) {
            'number' => $this->number($values[0]),
            'select' => (function () use ($attribute, $values, $platform, $mapping) {
                $option = $this->option($attribute, $values[0], $platform, $mapping);

                return $option ? [$option->code, null] : [null, "ค่าบนร้าน \"{$values[0]}\" ไม่ตรงกับตัวเลือกใน PIM (ตั้ง option mapping ก่อน)"];
            })(),
            'multiselect' => (function () use ($attribute, $values, $platform, $mapping) {
                $codes = [];
                foreach ($values as $value) {
                    $option = $this->option($attribute, $value, $platform, $mapping);
                    if (! $option) {
                        return [null, "ค่าบนร้าน \"{$value}\" ไม่ตรงกับตัวเลือกใน PIM (ตั้ง option mapping ก่อน)"];
                    }
                    $codes[$option->code] = true;
                }

                return [json_encode(array_keys($codes), JSON_UNESCAPED_UNICODE), null];
            })(),
            default => [implode(', ', $values), null],
        };
    }

    /** @return array{0: ?string, 1: ?string} */
    private function number(string $value): array
    {
        if (preg_match('/-?\d+(?:\.\d+)?/', str_replace(',', '', $value), $m)) {
            $n = str_contains($m[0], '.') ? rtrim(rtrim($m[0], '0'), '.') : $m[0];

            return [$n === '' || $n === '-' ? '0' : $n, null];
        }

        return [null, $value === '' ? null : "\"{$value}\" ไม่ใช่ตัวเลข"];
    }

    private function option(Attribute $attribute, string $value, string $platform, object $mapping): ?AttributeOption
    {
        $needle = Str::lower(trim($value));
        [, , , $optionModel, $fk, $prefix] = self::MAPPINGS[$platform];

        if ($optionModel !== null) {
            $optionId = $optionModel::where($fk, $mapping->id)
                ->get(['attribute_option_id', "{$prefix}_value", "{$prefix}_label"])
                ->first(fn ($o) => in_array($needle, [Str::lower(trim((string) $o->{"{$prefix}_label"})), Str::lower(trim((string) $o->{"{$prefix}_value"}))], true))
                ?->attribute_option_id;
            if ($optionId && ($option = AttributeOption::find($optionId))) {
                return $option;
            }
        }

        return AttributeOption::where('attribute_id', $attribute->id)->get(['id', 'code', 'admin_label'])
            ->first(fn (AttributeOption $o) => in_array($needle, [Str::lower($o->code), Str::lower((string) $o->admin_label)], true));
    }

    private function brandFor(string $platform, MarketplaceListingDetail $detail): ?Brand
    {
        if ($detail->brand_id !== null && ctype_digit((string) $detail->brand_id)) {
            $brand = Brand::where("{$platform}_brand_id", (int) $detail->brand_id)->first();
            if ($brand) {
                return $brand;
            }
        }
        if ($detail->brand_name !== null) {
            $needle = Str::lower(trim($detail->brand_name));

            return Brand::query()->get()->first(fn (Brand $b) => in_array($needle, [Str::lower((string) $b->code), Str::lower((string) $b->name)], true));
        }

        return null;
    }

    /** Shopee sends plain text (→ one <p> per line); the others HTML (→ allow-listed tags, no attributes) */
    private function descriptionHtml(MarketplaceListingDetail $detail): ?string
    {
        $raw = $detail->description ?? $detail->description_text;
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        if (! str_contains($raw, '<')) {
            $lines = array_filter(array_map('trim', preg_split('/\R/u', $raw)), fn ($l) => $l !== '');

            return implode('', array_map(fn ($l) => '<p>'.e($l).'</p>', $lines));
        }

        return $this->sanitiseHtml($raw);
    }

    /** platform HTML → allow-listed tags only, no attributes */
    private function sanitiseHtml(string $html): ?string
    {
        $html = strip_tags($html, self::ALLOWED_HTML);
        $html = trim(preg_replace('/<(\w+)\s[^>]*>/u', '<$1>', $html));

        return $html === '' ? null : $html;
    }

    /** our own editor's HTML → unchanged except script-capable content */
    private function stripActiveContent(string $html): ?string
    {
        $html = preg_replace('~<(script|style|iframe|object|embed)\b[^>]*>.*?</\1\s*>~is', '', $html);
        $html = preg_replace('~<(script|style|iframe|object|embed)\b[^>]*/?>~i', '', $html);
        $html = preg_replace('~\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)~i', '', $html);
        $html = preg_replace('~(href|src)\s*=\s*(["\']?)\s*javascript:[^"\'\s>]*\2~i', '$1="#"', $html);
        $html = trim((string) $html);

        return $this->plain($html) === '' && ! str_contains($html, '<img') ? null : $html;
    }
}
