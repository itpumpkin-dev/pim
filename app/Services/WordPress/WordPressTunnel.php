<?php

namespace App\Services\WordPress;

use Illuminate\Process\InvokedProcess;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Opens/closes the SSH tunnel `scripts/wordpress_tunnel.py` needs to reach
 * the WordPress/WooCommerce site's MySQL database — that database only
 * binds to localhost on its own host (confirmed live: a direct connection
 * from this app's network is rejected at the MySQL host-ACL level), so it's
 * only reachable by tunneling through SSH first, the same way the site's
 * own Navicat client is configured.
 *
 * The tunnel itself is a standalone Python/paramiko script rather than pure
 * PHP — phpseclib (the closest PHP SSH library) has no first-class local
 * port-forward API to build this on top of with any confidence, while the
 * Python script is the exact mechanism already proven working live against
 * this database this session.
 */
class WordPressTunnel
{
    private const LOCAL_PORT = 33061;

    private const READY_TIMEOUT_SECONDS = 15;

    private ?InvokedProcess $process = null;

    public function open(): void
    {
        $config = config('services.wordpress_db');

        if (empty($config['ssh_host']) || empty($config['ssh_username']) || empty($config['ssh_password']) || empty($config['db_database'])) {
            throw new RuntimeException('WordPress DB tunnel is not configured — set WORDPRESS_SSH_HOST/WORDPRESS_SSH_USERNAME/WORDPRESS_SSH_PASSWORD/WORDPRESS_DB_DATABASE (and the other WORDPRESS_DB_*/WORDPRESS_SSH_* vars) in .env.');
        }

        $scriptPath = base_path('scripts/wordpress_tunnel.py');

        // Credentials go through env(), never as command-line arguments, so
        // they never show up in a process listing (ps/tasklist).
        $this->process = Process::env([
            'WP_SSH_HOST' => $config['ssh_host'],
            'WP_SSH_PORT' => (string) $config['ssh_port'],
            'WP_SSH_USERNAME' => $config['ssh_username'],
            'WP_SSH_PASSWORD' => $config['ssh_password'],
            'WP_DB_HOST' => $config['db_host'],
            'WP_DB_PORT' => (string) $config['db_port'],
            'WP_LOCAL_PORT' => (string) self::LOCAL_PORT,
        ])
            // The tunnel must outlive the whole sync run, not Symfony
            // Process's own 60s default — this caps it well above any
            // realistic run instead of disabling it outright.
            ->timeout(3600)
            ->start(['python3', $scriptPath]);

        $deadline = microtime(true) + self::READY_TIMEOUT_SECONDS;
        $buffer = '';

        while (microtime(true) < $deadline) {
            if (!$this->process->running()) {
                $error = trim($this->process->errorOutput().$this->process->output());
                throw new RuntimeException("WordPress SSH tunnel process exited before becoming ready: {$error}");
            }

            $buffer .= $this->process->latestOutput();
            if (str_contains($buffer, 'TUNNEL READY')) {
                return;
            }

            usleep(200_000);
        }

        $this->process->stop();
        throw new RuntimeException('Timed out waiting for the WordPress SSH tunnel to become ready.');
    }

    public function close(): void
    {
        $this->process?->stop();
        $this->process = null;
    }

    public function localPort(): int
    {
        return self::LOCAL_PORT;
    }
}
