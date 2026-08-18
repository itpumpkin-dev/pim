<?php

namespace App\Jobs;

/**
 * Thrown mid-run when a JobTracker's cancel_requested_at has been set
 * (see JobTrackerController::cancel()) — used by jobs whose row loop lives
 * inside a generator (e.g. ProcessExportJob, where the export writer pulls
 * rows lazily) so cancellation can unwind cleanly out of that generator into
 * the surrounding handle() method instead of needing a return-value/flag
 * threaded back through the writer.
 */
class JobCancelledException extends \RuntimeException
{
}
