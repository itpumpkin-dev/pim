<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\CategoryField;
use Illuminate\Database\Seeder;

class CategoryTaxonomySeeder extends Seeder
{
    /**
     * Builds the real 3-level category tree (category -> subcategory ->
     * product group) from database/data/{categories,subcategories,product_groups}.csv,
     * exported from the business's actual master data
     * (ProdChoiceCat.xlsx / Prod_Choice_SubCat.xlsx / Prod_Choice_ProductGroup.xlsx).
     * IDs encode the hierarchy (e.g. product group A001001 belongs to
     * subcategory A001, which belongs to category A), which is mirrored here
     * via Category's self-referencing `parent_id`.
     */
    public function run(): void
    {
        CategoryField::updateOrCreate(
            ['code' => 'meta_description'],
            [
                'type' => 'Textarea',
                'labels' => ['th' => 'คำอธิบาย SEO', 'en' => 'SEO Description'],
                'is_required' => false,
                'value_per_locale' => false,
                'status' => true,
                'position' => 0,
                'display_section' => null,
            ]
        );

        $categoryIds = [];
        foreach ($this->readCsv('categories.csv') as $row) {
            if ($row['pCatStatus'] !== 'Active') {
                continue;
            }

            $category = Category::updateOrCreate(
                ['code' => strtolower($row['pCatID'])],
                [
                    'name' => $row['pCatName'],
                    'parent_id' => null,
                    'additional_data' => ['name_eng' => $row['pCatNameENG']],
                ]
            );

            $categoryIds[$row['pCatID']] = $category->id;
        }

        $subcategoryIds = [];
        foreach ($this->readCsv('subcategories.csv') as $row) {
            if ($row['pSubCatStatus'] !== 'Active' || !isset($categoryIds[$row['pCatID']])) {
                continue;
            }

            $subcategory = Category::updateOrCreate(
                ['code' => strtolower($row['pSubCatID'])],
                [
                    'name' => $row['pSubCatName'],
                    'parent_id' => $categoryIds[$row['pCatID']],
                    'additional_data' => ['name_eng' => $row['pSubCatNameENG']],
                ]
            );

            $subcategoryIds[$row['pSubCatID']] = $subcategory->id;
        }

        foreach ($this->readCsv('product_groups.csv') as $row) {
            $subCatId = substr($row['ProductGroupID'], 0, 4);

            if ($row['ProductGroupStatus'] !== 'Active' || !isset($subcategoryIds[$subCatId])) {
                continue;
            }

            Category::updateOrCreate(
                ['code' => strtolower($row['ProductGroupID'])],
                [
                    'name' => $row['ProductGroupName'],
                    'parent_id' => $subcategoryIds[$subCatId],
                    'additional_data' => ['name_eng' => $row['ProductGroupNameENG']],
                ]
            );
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
