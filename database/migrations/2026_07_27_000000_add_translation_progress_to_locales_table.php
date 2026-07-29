<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->string('translation_status', 20)->default('not_started')->after('enabled');
            $table->unsignedInteger('translation_total')->default(0)->after('translation_status');
            $table->unsignedInteger('translation_translated')->default(0)->after('translation_total');
            $table->timestamp('translation_started_at')->nullable()->after('translation_translated');
            $table->timestamp('translation_completed_at')->nullable()->after('translation_started_at');
        });

        $this->backfillExistingLocales();
    }

    public function down(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->dropColumn([
                'translation_status',
                'translation_total',
                'translation_translated',
                'translation_started_at',
                'translation_completed_at',
            ]);
        });
    }

    /**
     * Locales created before this feature existed have no tracked progress.
     * "en" is the source language (trivially 100%); for every other locale,
     * compare its files on disk against the English source so an already
     * hand-translated locale (e.g. "th") doesn't show up as 0%.
     */
    private function backfillExistingLocales(): void
    {
        $sourceDir = resource_path('js/locales/en');

        if (! File::isDirectory($sourceDir)) {
            return;
        }

        $sourceStrings = [];
        foreach (File::files($sourceDir) as $file) {
            $sourceStrings[$file->getFilename()] = json_decode(File::get($file->getPathname()), true) ?? [];
        }

        $sourceTotal = 0;
        foreach ($sourceStrings as $strings) {
            $sourceTotal += count($this->flatten($strings));
        }

        foreach (DB::table('locales')->get() as $locale) {
            if ($locale->code === 'en') {
                DB::table('locales')->where('id', $locale->id)->update([
                    'translation_status' => 'completed',
                    'translation_total' => $sourceTotal,
                    'translation_translated' => $sourceTotal,
                    'translation_completed_at' => now(),
                ]);

                continue;
            }

            $targetDir = resource_path('js/locales/' . $locale->code);

            if (! File::isDirectory($targetDir)) {
                continue;
            }

            $translated = 0;

            foreach ($sourceStrings as $filename => $strings) {
                $targetPath = $targetDir . '/' . $filename;
                $targetStrings = File::exists($targetPath)
                    ? (json_decode(File::get($targetPath), true) ?? [])
                    : [];
                $targetFlat = collect($this->flatten($targetStrings))->pluck(1, 0);

                foreach ($this->flatten($strings) as [$key, $value]) {
                    if (($targetFlat[$key] ?? null) !== $value) {
                        $translated++;
                    }
                }
            }

            $status = match (true) {
                $translated === 0 => 'not_started',
                $translated === $sourceTotal => 'completed',
                default => 'partial',
            };

            DB::table('locales')->where('id', $locale->id)->update([
                'translation_status' => $status,
                'translation_total' => $sourceTotal,
                'translation_translated' => $translated,
                'translation_completed_at' => $status !== 'not_started' ? now() : null,
            ]);
        }
    }

    /**
     * @return array<int, array{0: string, 1: string}> [dotted key path, value]
     */
    private function flatten(array $data, array $path = []): array
    {
        $entries = [];

        foreach ($data as $key => $value) {
            $currentPath = [...$path, $key];

            if (is_array($value)) {
                array_push($entries, ...$this->flatten($value, $currentPath));
            } else {
                $entries[] = [implode('.', $currentPath), (string) $value];
            }
        }

        return $entries;
    }
};
