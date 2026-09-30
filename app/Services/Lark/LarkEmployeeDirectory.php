<?php

namespace App\Services\Lark;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Read-only lookup into the HR employee table kept in Lark Base (Bitable).
 * Used by the create-user dialog's "ดึงข้อมูล" button to prefill a new
 * PIM user from their employee record (PRS_NO = รหัสพนักงาน).
 */
class LarkEmployeeDirectory
{
    private const TOKEN_CACHE_KEY = 'lark.tenant_access_token';

    /** Longest edge of the avatar saved from EMP_PHOTO — HR originals run up to ~2MB+. */
    private const AVATAR_MAX_EDGE = 512;

    /**
     * @return array{employee_id: string, first_name: ?string, last_name: ?string, email: ?string, department: ?string, job_position: ?string, has_photo: bool}|null
     *         null when no employee has that PRS_NO
     *
     * @throws \RuntimeException when Lark isn't configured or the API call fails
     */
    public function findByEmployeeId(string $employeeId): ?array
    {
        $fields = $this->findFields($employeeId);
        if ($fields === null) {
            return null;
        }

        return [
            'employee_id' => $this->text($fields['PRS_NO'] ?? null) ?? $employeeId,
            'first_name' => $this->text($fields['EMP_NAME'] ?? null),
            'last_name' => $this->text($fields['EMP_SURNME'] ?? null),
            'email' => $this->text($fields['EMP_EMAIL'] ?? null),
            'department' => $this->text($fields['PRO_DEPT'] ?? null),
            'job_position' => $this->text($fields['JBT_THAIDESC'] ?? null),
            'has_photo' => $this->photoAttachment($fields) !== null,
        ];
    }

    /**
     * Downloads the employee's EMP_PHOTO, downscaled to AVATAR_MAX_EDGE as a
     * JPEG when GD is available (original bytes otherwise). Looked up by
     * employee id again rather than taking a file_token from the browser, so
     * this can only ever fetch a photo that belongs to a real HR record.
     *
     * @return array{contents: string, mime: string, extension: string}|null null when the employee or their photo doesn't exist
     *
     * @throws \RuntimeException when the API call fails
     */
    public function downloadPhoto(string $employeeId): ?array
    {
        $fields = $this->findFields($employeeId);
        $attachment = $fields ? $this->photoAttachment($fields) : null;
        if (! $attachment) {
            return null;
        }

        $config = config('services.lark');
        // The attachment's own `url` carries the `extra` bitablePerm param
        // that Drive needs to authorize a download of a Base attachment.
        $url = $attachment['url'] ?? "{$config['base_url']}/drive/v1/medias/{$attachment['file_token']}/download";

        $response = Http::withToken($this->tenantAccessToken())->timeout(30)->get($url);
        if (! $response->successful()) {
            throw new \RuntimeException("Lark photo download failed: HTTP {$response->status()}");
        }

        return $this->shrink($response->body())
            ?? ['contents' => $response->body(), 'mime' => $attachment['type'] ?? 'image/jpeg', 'extension' => pathinfo($attachment['name'] ?? '', PATHINFO_EXTENSION) ?: 'jpg'];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findFields(string $employeeId): ?array
    {
        $config = config('services.lark');
        if (empty($config['employee_app_token']) || empty($config['employee_table_id'])) {
            throw new \RuntimeException('Lark employee table is not configured (LARK_BASE_APP_TOKEN / LARK_BASE_TABLE_ID).');
        }

        $response = Http::withToken($this->tenantAccessToken())
            ->timeout(15)
            ->post("{$config['base_url']}/bitable/v1/apps/{$config['employee_app_token']}/tables/{$config['employee_table_id']}/records/search?page_size=1", [
                'filter' => [
                    'conjunction' => 'and',
                    'conditions' => [
                        ['field_name' => 'PRS_NO', 'operator' => 'is', 'value' => [$employeeId]],
                    ],
                ],
                'automatic_fields' => false,
            ]);

        $body = $response->json() ?? [];
        if (! $response->successful() || ($body['code'] ?? -1) !== 0) {
            // Token revoked/expired early — drop it so the next call fetches a fresh one.
            Cache::forget(self::TOKEN_CACHE_KEY);

            throw new \RuntimeException('Lark employee lookup failed: '.($body['msg'] ?? "HTTP {$response->status()}"));
        }

        $fields = $body['data']['items'][0]['fields'] ?? null;

        return is_array($fields) ? $fields : null;
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array{file_token: string, name?: string, type?: string, url?: string}|null
     */
    private function photoAttachment(array $fields): ?array
    {
        $first = $fields['EMP_PHOTO'][0] ?? null;

        return is_array($first) && ! empty($first['file_token']) ? $first : null;
    }

    /**
     * @return array{contents: string, mime: string, extension: string}|null null when GD is missing or can't decode the image
     */
    private function shrink(string $bytes): ?array
    {
        if (! function_exists('imagecreatefromstring')) {
            return null;
        }

        $source = @imagecreatefromstring($bytes);
        if ($source === false) {
            return null;
        }

        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, self::AVATAR_MAX_EDGE / max($width, $height));
        $target = imagecreatetruecolor(max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
        // White background so a transparent PNG doesn't turn black as JPEG.
        imagefill($target, 0, 0, imagecolorallocate($target, 255, 255, 255));
        imagecopyresampled($target, $source, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height);

        ob_start();
        imagejpeg($target, null, 85);
        $jpeg = (string) ob_get_clean();

        return ['contents' => $jpeg, 'mime' => 'image/jpeg', 'extension' => 'jpg'];
    }

    private function tenantAccessToken(): string
    {
        $cached = Cache::get(self::TOKEN_CACHE_KEY);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $config = config('services.lark');
        if (empty($config['app_id']) || empty($config['app_secret'])) {
            throw new \RuntimeException('Lark app credentials are not configured (LARK_APP_ID_BASE_API / LARK_APP_SECRET_BASE_API).');
        }

        $response = Http::timeout(15)->post("{$config['base_url']}/auth/v3/tenant_access_token/internal", [
            'app_id' => $config['app_id'],
            'app_secret' => $config['app_secret'],
        ]);

        $body = $response->json() ?? [];
        $token = $body['tenant_access_token'] ?? null;
        if (! $response->successful() || ($body['code'] ?? -1) !== 0 || ! is_string($token)) {
            throw new \RuntimeException('Lark authentication failed: '.($body['msg'] ?? "HTTP {$response->status()}"));
        }

        // Lark tokens live ~2h (`expire`, seconds); refresh 5 min early.
        Cache::put(self::TOKEN_CACHE_KEY, $token, max(60, (int) ($body['expire'] ?? 7200) - 300));

        return $token;
    }

    /**
     * Bitable returns a text cell either as a plain string (list API) or as
     * rich-text segments `[{type: "text", text: "..."}]` (search API).
     */
    private function text(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = collect($value)->map(fn ($segment) => is_array($segment) ? ($segment['text'] ?? '') : (string) $segment)->implode('');
        }

        if (! is_scalar($value)) {
            return null;
        }

        // Some names in the sheet carry runs of spaces ("Somchai   Chaowapatanwong").
        $value = trim(preg_replace('/\s+/u', ' ', (string) $value));

        return $value === '' ? null : $value;
    }
}
