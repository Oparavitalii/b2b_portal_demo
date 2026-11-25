<?php

declare(strict_types=1);

/**
 * Outgoing e-mail.
 *
 * MAIL_DRIVER=log (default; development and tests): every message is appended
 * to storage/mail.log as one JSON line {to,subject,html,text,at}.
 * MAIL_DRIVER=smtp: sent through Mailer (vendored PHPMailer, MAIL_* env).
 *
 * Templates live in templates/mail/<name>.php; render() includes one with the
 * given variables extracted into its scope and returns the produced HTML.
 */
final class Mail
{
    public static function send(string $to, string $subject, string $html, ?string $text = null): void
    {
        $plain = $text ?? self::toText($html);
        $driver = strtolower((string) env('MAIL_DRIVER', 'log'));
        if ($driver === 'smtp') {
            Mailer::send($to, $subject, $html, $plain);
            return;
        }
        if ($driver !== 'log') {
            throw new RuntimeException('Unknown MAIL_DRIVER: ' . $driver);
        }
        $line = json_encode(
            ['to' => $to, 'subject' => $subject, 'html' => $html, 'text' => $plain, 'at' => now_iso()],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
        file_put_contents(storage_path('mail.log'), $line . "\n", FILE_APPEND | LOCK_EX);
    }

    public static function templatePath(string $template): string
    {
        if (preg_match('/^[A-Za-z0-9_]+$/', $template) !== 1) {
            throw new InvalidArgumentException('Invalid mail template name: ' . $template);
        }
        return dirname(__DIR__, 2) . '/templates/mail/' . $template . '.php';
    }

    public static function hasTemplate(string $template): bool
    {
        return is_file(self::templatePath($template));
    }

    /** Includes templates/mail/<template>.php with $vars extracted and returns its output. */
    public static function render(string $template, array $vars): string
    {
        $file = self::templatePath($template);
        if (!is_file($file)) {
            throw new RuntimeException('Mail template not found: ' . $template);
        }
        return (static function (string $__file, array $__vars): string {
            extract($__vars, EXTR_SKIP);
            ob_start();
            try {
                include $__file;
            } catch (Throwable $e) {
                ob_end_clean();
                throw $e;
            }
            return (string) ob_get_clean();
        })($file, $vars);
    }

    /** Plain-text alternative: links become "label (url)", tags stripped, entities decoded. */
    public static function toText(string $html): string
    {
        $withLinks = (string) preg_replace('#<a [^>]*href="([^"]*)"[^>]*>(.*?)</a>#is', '$2 ($1)', $html);
        $withBreaks = (string) preg_replace('#<(br|/p|/tr|/h[1-6]|/div)\b[^>]*>#i', "$0\n", $withLinks);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = (string) preg_replace("/[ \t]+\n/", "\n", $text);
        return trim((string) preg_replace('/\n{3,}/', "\n\n", $text));
    }
}
