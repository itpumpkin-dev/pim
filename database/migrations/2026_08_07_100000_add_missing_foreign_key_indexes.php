<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
     */
    public $withinTransaction = false;

    private array $indexes = [
        'idx_channels_created_by' => ['channels', 'created_by'],
        'idx_channels_root_category_id' => ['channels', 'root_category_id'],
        'idx_channels_updated_by' => ['channels', 'updated_by'],
        'idx_categories_lazada_category_id' => ['categories', 'lazada_category_id'],
        'idx_users_department_id' => ['users', 'department_id'],
        'idx_users_job_position_id' => ['users', 'job_position_id'],
        'idx_user_group_user_group_id' => ['user_group_user', 'group_id'],
        'idx_user_role_role_id' => ['user_role', 'role_id'],
        'idx_role_user_group_group_id' => ['role_user_group', 'group_id'],
        'idx_role_user_group_role_id' => ['role_user_group', 'role_id'],
        'idx_family_attributes_attribute_id' => ['family_attributes', 'attribute_id'],
        'idx_category_field_values_category_field_id' => ['category_field_values', 'category_field_id'],
        'idx_product_values_attribute_id' => ['product_values', 'attribute_id'],
        'idx_product_associations_association_type_id' => ['product_associations', 'association_type_id'],
        'idx_product_versions_user_id' => ['product_versions', 'user_id'],
        'idx_attribute_group_translations_locale_id' => ['attribute_group_translations', 'locale_id'],
        'idx_attribute_family_translations_locale_id' => ['attribute_family_translations', 'locale_id'],
        'idx_attribute_translations_locale_id' => ['attribute_translations', 'locale_id'],
        'idx_channel_locale_locale_id' => ['channel_locale', 'locale_id'],
        'idx_channel_currency_currency_id' => ['channel_currency', 'currency_id'],
        'idx_channel_translations_locale_id' => ['channel_translations', 'locale_id'],
        'idx_import_configs_created_by' => ['import_configs', 'created_by'],
        'idx_import_configs_updated_by' => ['import_configs', 'updated_by'],
        'idx_export_configs_created_by' => ['export_configs', 'created_by'],
        'idx_export_configs_updated_by' => ['export_configs', 'updated_by'],
        'idx_job_trackers_export_config_id' => ['job_trackers', 'export_config_id'],
        'idx_job_trackers_import_config_id' => ['job_trackers', 'import_config_id'],
        'idx_job_trackers_user_id' => ['job_trackers', 'user_id'],
        'idx_sales_platforms_created_by' => ['sales_platforms', 'created_by'],
        'idx_sales_platforms_updated_by' => ['sales_platforms', 'updated_by'],
        'idx_sales_platform_shops_channel_id' => ['sales_platform_shops', 'channel_id'],
        'idx_sales_platform_shops_created_by' => ['sales_platform_shops', 'created_by'],
        'idx_sales_platform_shops_updated_by' => ['sales_platform_shops', 'updated_by'],
        'idx_product_platform_shops_sales_platform_shop_id' => ['product_platform_shops', 'sales_platform_shop_id'],
        'idx_attribute_option_translations_locale_id' => ['attribute_option_translations', 'locale_id'],
    ];

    public function up(): void
    {
        foreach ($this->indexes as $name => [$table, $column]) {
            DB::statement("CREATE INDEX CONCURRENTLY IF NOT EXISTS {$name} ON {$table} ({$column})");
        }
    }

    public function down(): void
    {
        foreach (array_keys($this->indexes) as $name) {
            DB::statement("DROP INDEX CONCURRENTLY IF EXISTS {$name}");
        }
    }
};
