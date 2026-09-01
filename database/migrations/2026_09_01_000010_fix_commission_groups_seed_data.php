<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The original create_commission_groups_table seed had a bug: every row's
     * `group_id_1` (PGroupName) was written as a copy of its `code`
     * (PGroupID) instead of the actual name ("อื่นๆ", "G1", "G1.1", ...), and
     * `divisor_start`/`divisor_secondary` were left at 0 for every row
     * instead of the rates from the accompanying 50%/100% table. Fixed in the
     * migration file for fresh installs; this repairs any environment that
     * already ran the buggy version (matched by the immutable `code`).
     */
    public function up(): void
    {
        $fixes = [
            'C001' => ['อื่นๆ', 0, 0],
            'C002' => ['No Com', 0, 0],
            'C003' => ['G1', 2.00, 4.00],
            'C004' => ['G1.1', 2.00, 4.00],
            'C005' => ['G2', 1.50, 3.00],
            'C006' => ['G3', 0.50, 0.50],
            'C007' => ['G4', 0.20, 0.20],
            'C008' => ['G5', 0.20, 0.20],
            'C009' => ['Power Tools', 0.50, 0.50],
            'C010' => ['Spark', 0, 0],
            'C011' => ['Customer Brand', 0, 0],
            'C012' => ['Fujitsu', 1.00, 1.00],
            'C013' => ['Remark', 0, 0],
            'C014' => ['G6', 0.25, 0.25],
            'C015' => ['G6.1', 1.00, 1.00],
            'C016' => ['G0', 1.00, 2.00],
            'C017' => ['G7', 0.25, 0.25],
            'C018' => ['G8', 0, 0],
        ];

        foreach ($fixes as $code => [$name, $start, $secondary]) {
            DB::table('commission_groups')
                ->where('code', $code)
                // Only touch rows that still look untouched (group_id_1 ===
                // code) — don't clobber a name/divisor the user has already
                // edited by hand through the admin screen since seeding.
                ->where('group_id_1', $code)
                ->where('divisor_start', 0)
                ->where('divisor_secondary', 0)
                ->update([
                    'group_id_1' => $name,
                    'divisor_start' => $start,
                    'divisor_secondary' => $secondary,
                ]);
        }
    }

    public function down(): void
    {
        // Data fix — no reasonable rollback.
    }
};
