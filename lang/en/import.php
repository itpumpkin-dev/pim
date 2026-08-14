<?php

// Display labels for the fixed (non-attribute) columns each RowImporter
// supports — used as the sample template's header row and to accept a
// label in place of a raw code when reading an uploaded file back. See
// RowHeaderNormalizer.
return [
    'columns' => [
        'sku' => 'SKU',
        'family_code' => 'Family Code',
        'type' => 'Type',
        'enabled' => 'Enabled',
        'code' => 'Code',
        'name' => 'Name',
        'description' => 'Description',
        'parent_code' => 'Parent Code',
        'is_required' => 'Is Required',
        'is_unique' => 'Is Unique',
        'is_locale_based' => 'Is Locale Based',
        'is_channel_based' => 'Is Channel Based',
        'is_filterable' => 'Is Filterable',
        'attribute_code' => 'Attribute Code',
        'admin_label' => 'Admin Label',
        'swatch_value' => 'Swatch Value',
        'sort_order' => 'Sort Order',
    ],
];
