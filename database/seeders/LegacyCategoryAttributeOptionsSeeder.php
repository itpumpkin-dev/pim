<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeOption;
use Illuminate\Database\Seeder;

/**
 * Populates dropdown options for the legacy flat-text category fields
 * (pcatid, pcatname, psubcatname, productgroupname) from the same master
 * CSVs CategoryTaxonomySeeder uses for the real category tree — these
 * fields are deliberately kept independent of that tree (see
 * ProductController), but should still offer the same real category names
 * to pick from instead of free typing.
 *
 * `code` holds the real category code (e.g. "a001001") since AttributeOption
 * codes must be unique per attribute and several subcategory/product-group
 * names collide across different parents; `admin_label` holds the Thai name
 * shown in the dropdown. ProductPresenter/StorefrontController resolve the
 * stored code back to its label wherever pcatname's value is displayed or
 * matched against.
 */
class LegacyCategoryAttributeOptionsSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedOptions('pcatid', 'categories.csv', 'pCatID', 'pCatName', 'pCatStatus');
        $this->seedOptions('pcatname', 'categories.csv', 'pCatID', 'pCatName', 'pCatStatus');
        $this->seedOptions('psubcatname', 'subcategories.csv', 'pSubCatID', 'pSubCatName', 'pSubCatStatus');
        $this->seedOptions('productgroupname', 'product_groups.csv', 'ProductGroupID', 'ProductGroupName', 'ProductGroupStatus');
    }

    private function seedOptions(string $attributeCode, string $csvFile, string $idColumn, string $nameColumn, string $statusColumn): void
    {
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (!$attribute) {
            return;
        }

        $sortOrder = 0;
        foreach ($this->readCsv($csvFile) as $row) {
            if (($row[$statusColumn] ?? null) !== 'Active') {
                continue;
            }

            AttributeOption::updateOrCreate(
                ['attribute_id' => $attribute->id, 'code' => strtolower($row[$idColumn])],
                ['admin_label' => $row[$nameColumn], 'sort_order' => $sortOrder]
            );

            $sortOrder++;
        }
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function readCsv(string $filename): array
    {
        $handle = fopen(database_path("data/{$filename}"), 'r');
        $header = fgetcsv($handle);
        $rows = [];

        while (($data = fgetcsv($handle)) !== false) {
            $rows[] = array_combine($header, $data);
        }

        fclose($handle);

        return $rows;
    }
}
