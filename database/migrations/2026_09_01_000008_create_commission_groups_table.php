<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "กลุ่มคอมมิชชั่น" (Commission Groups) master — `code` (PGroupID),
     * `group_id_1` (PGroupName), `remark` (pGroupRemark), plus two
     * commission-rate columns (`divisor_start` "ตัวหารเริ่ม" shown at 100%,
     * `divisor_secondary` "ตัวหารรอง" shown at 50%) and a status flag.
     * Seeded from the PGroupID/PGroupName/pGroupRemark list supplied for this
     * master; divisor values are backfilled for the rows whose name also
     * appeared in the accompanying 50%/100% rate table (matched by name —
     * case/space-insensitive) and left at 0 for the rest (อื่นๆ, No Com,
     * Spark, Customer Brand, Remark, G8), editable afterwards from the admin
     * screen.
     */
    public function up(): void
    {
        Schema::create('commission_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('group_id_1')->nullable();
            $table->decimal('divisor_start', 8, 2)->default(0);
            $table->decimal('divisor_secondary', 8, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('remark')->nullable();
            $table->timestamps();
        });

        $rates = [
            'g0' => [1.00, 2.00],
            'g1.1' => [2.00, 4.00],
            'g1' => [2.00, 4.00],
            'g2' => [1.50, 3.00],
            'g3' => [0.50, 0.50],
            'g4' => [0.20, 0.20],
            'power tools' => [0.50, 0.50],
            'g5' => [0.20, 0.20],
            'g6' => [0.25, 0.25],
            'g6.1' => [1.00, 1.00],
            'fujitsu' => [1.00, 1.00],
            'g7' => [0.25, 0.25],
        ];

        $rows = [
            ['C001', 'อื่นๆ', 'ไม่รวมในยอดขาย'],
            ['C002', 'No Com', null],
            ['C003', 'G1', null],
            ['C004', 'G1.1', 'ไตรมาส'],
            ['C005', 'G2', null],
            ['C006', 'G3', null],
            ['C007', 'G4', null],
            ['C008', 'G5', null],
            ['C009', 'Power Tools', null],
            ['C010', 'Spark', null],
            ['C011', 'Customer Brand', 'แบรนด์ลูกค้า'],
            ['C012', 'Fujitsu', 'ไม่รวมในยอดขาย'],
            ['C013', 'Remark', 'หมายเหตุ'],
            ['C014', 'G6', null],
            ['C015', 'G6.1', null],
            ['C016', 'G0', 'ไม่รวมในยอดขายของบุคคลและบริษัท'],
            ['C017', 'G7', null],
            ['C018', 'G8', null],
        ];

        $now = now();
        DB::table('commission_groups')->insert(array_map(function ($row) use ($rates, $now) {
            [$code, $name, $remark] = $row;
            [$start, $secondary] = $rates[strtolower($name)] ?? [0, 0];

            return [
                'code' => $code,
                'group_id_1' => $name,
                'divisor_start' => $start,
                'divisor_secondary' => $secondary,
                'is_active' => true,
                'remark' => $remark,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }, $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('commission_groups');
    }
};
