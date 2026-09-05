<?php

namespace App\Console\Commands;

use App\Models\AttributeFamily;
use App\Services\Catalog\DefaultAttributeFamilyAssigner;
use Illuminate\Console\Command;

/**
 * CLI entry point for DefaultAttributeFamilyAssigner — see that class for
 * the actual scoping/assignment logic (shared with the "Set as default for
 * every product group" button on the Attribute Family edit page).
 *
 * Defaults to overriding every product group, including ones that already
 * have a different family sitting at position 0 — confirmed with the user.
 * Any families a group already has are kept, just re-ordered so the chosen
 * one becomes first; nothing is ever detached. Pass --only-empty to instead
 * skip any product group that already has at least one family attached
 * (leave it alone entirely).
 */
class AssignDefaultAttributeFamilyCommand extends Command
{
    protected $signature = 'catalog:assign-default-family
        {family : Attribute family id or code to set as the default (sort_order=0) for every product group}
        {--only-empty : Skip product groups that already have at least one family attached}
        {--dry-run : Preview the change without writing anything}';

    protected $description = 'Set one attribute family as the default (sort_order=0) for every product group.';

    public function handle(DefaultAttributeFamilyAssigner $assigner): int
    {
        $identifier = $this->argument('family');
        $family = is_numeric($identifier)
            ? AttributeFamily::find((int) $identifier)
            : AttributeFamily::where('code', $identifier)->first();

        if (! $family) {
            $this->error("No attribute family found for '{$identifier}' (tried as id, then as code).");

            return self::FAILURE;
        }

        $onlyEmpty = (bool) $this->option('only-empty');
        $dryRun = (bool) $this->option('dry-run');

        $this->info(
            "Setting '{$family->name}' (id={$family->id}) as the default family for every product group"
            .($onlyEmpty ? ' that has none yet' : ', overriding any existing default')
            .($dryRun ? ' [dry run — no changes will be written]' : '').'...'
        );

        $result = $assigner->assignToAllProductGroups($family, $onlyEmpty, $dryRun);

        $this->info(
            ($dryRun ? 'Would update' : 'Updated')." {$result['updated']} product group(s)"
            .($result['skipped'] > 0 ? ", skipped {$result['skipped']} (already had this family as default, or already had one and --only-empty was set)" : '')
            .'.'
        );

        return self::SUCCESS;
    }
}
