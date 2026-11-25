<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * SMTP transport for Mail (MAIL_DRIVER=smtp). Wraps the vendored PHPMailer
 * (vendor/phpmailer/phpmailer, no Composer); its files load on first use only.
 *
 * Env: MAIL_HOST, MAIL_PORT (default 465), MAIL_USER, MAIL_PASS,
 * MAIL_FROM (default MAIL_USER), MAIL_FROM_NAME (default 'DEMO PARTS'),
 * MAIL_SECURE = ssl (SMTPS, default) | tls (STARTTLS) | none.
 */
final class Mailer
{
    public static function send(string $to, string $subject, string $html, string $text): void
    {
        self::load();
        $host = env('MAIL_HOST');
        $from = env('MAIL_FROM') ?? env('MAIL_USER');
        if ($host === null || $from === null) {
            throw new RuntimeException('MAIL_HOST and MAIL_FROM (or MAIL_USER) must be set for MAIL_DRIVER=smtp');
        }
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->Port = (int) env('MAIL_PORT', '465');
            $user = env('MAIL_USER');
            $mail->SMTPAuth = $user !== null;
            if ($user !== null) {
                $mail->Username = $user;
                $mail->Password = (string) env('MAIL_PASS', '');
            }
            $secure = strtolower((string) env('MAIL_SECURE', 'ssl'));
            if ($secure === 'tls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } elseif ($secure === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } else {
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = false;
            }
            $mail->CharSet = PHPMailer::CHARSET_UTF8;
            $mail->setFrom($from, (string) env('MAIL_FROM_NAME', 'DEMO PARTS'));
            $mail->addAddress($to);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = $html;
            $mail->AltBody = $text;
            $mail->send();
        } catch (PHPMailerException $e) {
            throw new RuntimeException('SMTP send failed: ' . $e->getMessage(), 0, $e);
        }
    }

    private static function load(): void
    {
        if (class_exists(PHPMailer::class, false)) {
            return;
        }
        $src = dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src/';
        require_once $src . 'Exception.php';
        require_once $src . 'PHPMailer.php';
        require_once $src . 'SMTP.php';
    }
}
