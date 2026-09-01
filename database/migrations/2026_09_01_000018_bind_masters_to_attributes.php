<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeTranslation;
use App\Models\BusinessType;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\Locale;
use App\Models\Point;
use App\Models\Vendor;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Binds 5 catalog masters to the `select` attribute their Edit Product
     * dropdown should come from — same idea as Brands/Base Units (which
     * already *are* AttributeOption rows), but these masters keep their own
     * rich tables instead of moving onto `attribute_options`; each write
     * from now on (see SyncsAttributeOptionMirror, wired into every
     * controller) also mirrors a code+label AttributeOption on the bound
     * attribute. This migration does the one-time backfill for rows that
     * already existed before that wiring landed, plus creates the one
     * attribute that didn't exist yet:
     *
     *   Points             → pointtype          (existing attribute, 1 old placeholder option kept)
     *   Commission Groups  → commission_group   (existing attribute, was empty)
     *   Business Types     → business_type      (NEW attribute — created here)
     *   Vendors            → vendor             (existing attribute, was empty)
     *   Currencies         → purchase_currency  (existing attribute, 4 options — jpy/thb/usd overlap
     *                                             and get adopted; rmb has no `currencies` row and is left as-is)
     */
    public function up(): void
    {
        $this->createBusinessTypeAttribute();
        $this->backfillPoints();
        $this->backfillCommissionGroups();
        $this->backfillBusinessTypes();
        $this->backfillVendors();
        $this->backfillCurrencies();
    }

    private function createBusinessTypeAttribute(): void
    {
        Schema::table('business_types', function (Blueprint $table) {
            $table->string('code')->nullable()->unique()->after('id');
        });

        foreach (BusinessType::orderBy('id')->get() as $businessType) {
            $businessType->update(['code' => 'biztype_'.$businessType->id]);
        }

        $attribute = Attribute::create([
            'code' => 'business_type',
            'type' => 'select',
            'name' => 'Business Type',
            'is_required' => false,
            'is_unique' => false,
            'is_locale_based' => false,
            'is_ai_translate' => false,
            'is_channel_based' => false,
            'is_filterable' => true,
        ]);

        foreach (['en' => 'Business Type', 'th' => 'ประเภทธุรกิจ'] as $localeCode => $label) {
            $localeId = Locale::idForCode($localeCode);
            if ($localeId) {
                AttributeTranslation::create(['attribute_id' => $attribute->id, 'locale_id' => $localeId, 'label' => $label]);
            }
        }

        Attribute::bumpCodeMapVersion();
        Attribute::bumpListVersion();

        // Same family/group as the other 3 pre-existing attributes this
        // migration wires up (pointtype, commission_group — "general";
        // vendor, purchase_currency — "purchasing").
        $familyId = DB::table('attribute_families')->where('code', 'general_chemical_product')->value('id');
        $groupId = DB::table('attribute_groups')->where('code', 'general')->value('id');

        if ($familyId && $groupId) {
            $nextSort = (int) DB::table('family_attributes')
                ->where('family_id', $familyId)
                ->where('attribute_group_id', $groupId)
                ->max('sort_order') + 1;

            DB::table('family_attributes')->insert([
                'family_id' => $familyId,
                'attribute_id' => $attribute->id,
                'attribute_group_id' => $groupId,
                'sort_order' => $nextSort,
            ]);
        }
    }

    private function mirrorOption(string $attributeCode, string $optionCode, ?string $label, bool $isActive = true): void
    {
        $attributeId = Attribute::where('code', $attributeCode)->value('id');
        if (! $attributeId) {
            return;
        }

        AttributeOption::updateOrCreate(
            ['attribute_id' => $attributeId, 'code' => $optionCode],
            ['admin_label' => $label, 'is_active' => $isActive]
        );
    }

    private function backfillPoints(): void
    {
        foreach (Point::all() as $point) {
            $this->mirrorOption('pointtype', $point->point_type, $point->point_type, $point->is_active);
        }
    }

    private function backfillCommissionGroups(): void
    {
        foreach (CommissionGroup::all() as $group) {
            $this->mirrorOption('commission_group', $group->code, $group->p_group_name ?? $group->code, $group->is_active);
        }
    }

    private function backfillBusinessTypes(): void
    {
        foreach (BusinessType::all() as $businessType) {
            $this->mirrorOption('business_type', $businessType->code, $businessType->name, $businessType->is_active);
        }
    }

    private function backfillVendors(): void
    {
        foreach (Vendor::all() as $vendor) {
            $this->mirrorOption('vendor', $vendor->code, $vendor->name, $vendor->is_active);
        }
    }

    private function backfillCurrencies(): void
    {
        foreach (Currency::all() as $currency) {
            $this->mirrorOption('purchase_currency', strtolower($currency->code), $currency->name);
        }
    }

    public function down(): void
    {
        // Data/attribute wiring — no reasonable rollback (would also delete
        // any options added by hand since, and any product values already
        // pointing at them).
    }
};
