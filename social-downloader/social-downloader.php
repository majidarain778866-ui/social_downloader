<?php
/**
 * Plugin Name: Social Video Downloader Pro
 * Plugin URI: https://getintodevice.com/
 * Description: Fast, responsive, glassmorphic social media video & MP3 audio downloader (supporting TikTok, Facebook, Instagram, YouTube, X/Twitter, Pinterest, and 40+ platforms) using the shortcode [social_downloader].
 * Version: 2.0.0
 * Author: GetIntoDevice & Arain Bro
 * Author URI: https://getintodevice.com/
 * License: GPL2
 * Text Domain: social-video-downloader
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

if (!defined('PSD_VERSION')) {
    define('PSD_VERSION', '2.0.0');
}

if (!class_exists('SocialDownloaderApp')) {
    class SocialDownloaderApp {

        public function __construct() {
            add_shortcode('social_downloader', array($this, 'render_downloader'));
            add_shortcode('social_video_downloader', array($this, 'render_downloader'));
            add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
            add_action('admin_menu', array($this, 'add_admin_menu'));
            add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        }

        public function enqueue_assets() {
            // Google Fonts
            wp_enqueue_style(
                'psd-google-fonts',
                'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
                array(),
                null
            );

            // Material Symbols Icons
            wp_enqueue_style(
                'psd-material-icons',
                'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap',
                array(),
                null
            );

            // Plugin Frontend CSS
            wp_enqueue_style(
                'psd-styles',
                plugin_dir_url(__FILE__) . 'assets/css/styles.css',
                array(),
                PSD_VERSION
            );

            // Plugin Frontend JS
            wp_enqueue_script(
                'psd-app',
                plugin_dir_url(__FILE__) . 'assets/js/app.js',
                array('jquery'),
                PSD_VERSION,
                true
            );

            // Pass backend configuration to JS
            $api_base = get_option('psd_api_base', 'https://social-downloader-pro.netlify.app');
            if (empty($api_base)) {
                $api_base = 'https://social-downloader-pro.netlify.app';
            }

            wp_localize_script('psd-app', 'psdSettings', array(
                'apiBase'       => esc_url_raw(rtrim($api_base, '/')),
                'brandSuffix'   => get_option('psd_brand_suffix', 'GetIntoDevice'),
                'enableYoutube' => get_option('psd_enable_youtube', '1'),
                'enableTiktok'  => get_option('psd_enable_tiktok', '1'),
                'enableInstagram' => get_option('psd_enable_instagram', '1'),
                'enableFacebook' => get_option('psd_enable_facebook', '1'),
                'enableTwitter' => get_option('psd_enable_twitter', '1'),
                'enablePinterest' => get_option('psd_enable_pinterest', '1'),
                'enableReddit'  => get_option('psd_enable_reddit', '1'),
                'enableTerabox' => get_option('psd_enable_terabox', '1')
            ));
        }

        public function enqueue_admin_assets($hook) {
            if ($hook !== 'toplevel_page_social-downloader') {
                return;
            }

            wp_enqueue_style(
                'psd-admin-fonts',
                'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap',
                array(),
                null
            );

            wp_enqueue_style('wp-color-picker');
            wp_enqueue_script('wp-color-picker');

            wp_enqueue_style(
                'psd-admin-styles',
                plugin_dir_url(__FILE__) . 'assets/css/admin-styles.css',
                array(),
                PSD_VERSION
            );
        }

        public function add_admin_menu() {
            add_menu_page(
                'Social Downloader Settings',
                'Social Downloader',
                'manage_options',
                'social-downloader',
                array($this, 'render_admin_dashboard'),
                'dashicons-download',
                80
            );
        }

        public function render_admin_dashboard() {
            // Handle saving settings
            if (isset($_POST['psd_save_settings']) && check_admin_referer('psd_settings_verify')) {
                $raw_api = !empty($_POST['psd_api_base']) ? esc_url_raw(rtrim($_POST['psd_api_base'], '/')) : 'https://social-downloader-pro.netlify.app';
                update_option('psd_api_base', $raw_api);
                update_option('psd_brand_suffix', sanitize_text_field($_POST['psd_brand_suffix']));
                update_option('psd_hero_title', sanitize_text_field($_POST['psd_hero_title']));
                update_option('psd_hero_subtitle', sanitize_text_field($_POST['psd_hero_subtitle']));

                update_option('psd_color_accent', sanitize_hex_color($_POST['psd_color_accent']));
                update_option('psd_color_grad_start', sanitize_hex_color($_POST['psd_color_grad_start']));
                update_option('psd_color_grad_end', sanitize_hex_color($_POST['psd_color_grad_end']));
                update_option('psd_color_cta_start', sanitize_hex_color($_POST['psd_color_cta_start']));
                update_option('psd_color_cta_end', sanitize_hex_color($_POST['psd_color_cta_end']));

                update_option('psd_ad_code_top', wp_unslash($_POST['psd_ad_code_top']));
                update_option('psd_ad_code_bottom', wp_unslash($_POST['psd_ad_code_bottom']));
                update_option('psd_custom_css', strip_tags(wp_unslash($_POST['psd_custom_css'])));
                update_option('psd_custom_js', wp_unslash($_POST['psd_custom_js']));

                update_option('psd_enable_youtube', isset($_POST['psd_enable_youtube']) ? '1' : '0');
                update_option('psd_enable_tiktok', isset($_POST['psd_enable_tiktok']) ? '1' : '0');
                update_option('psd_enable_instagram', isset($_POST['psd_enable_instagram']) ? '1' : '0');
                update_option('psd_enable_facebook', isset($_POST['psd_enable_facebook']) ? '1' : '0');
                update_option('psd_enable_twitter', isset($_POST['psd_enable_twitter']) ? '1' : '0');
                update_option('psd_enable_pinterest', isset($_POST['psd_enable_pinterest']) ? '1' : '0');
                update_option('psd_enable_reddit', isset($_POST['psd_enable_reddit']) ? '1' : '0');
                update_option('psd_enable_terabox', isset($_POST['psd_enable_terabox']) ? '1' : '0');
                update_option('psd_theme', sanitize_text_field($_POST['psd_theme']));

                echo '<div class="notice notice-success is-dismissible"><p><strong>Settings successfully updated!</strong></p></div>';
            }

            $api_base = get_option('psd_api_base', 'https://social-downloader-pro.netlify.app');
            $brand_suffix = get_option('psd_brand_suffix', 'GetIntoDevice');
            $hero_title = get_option('psd_hero_title', 'All-in-One Social Video Downloader');
            $hero_subtitle = get_option('psd_hero_subtitle', 'Fast, free & high quality video & MP3 audio download from TikTok, Instagram, Facebook, YouTube, X and 40+ platforms.');

            $color_accent = get_option('psd_color_accent', '#8b5cf6');
            $color_grad_start = get_option('psd_color_grad_start', '#8b5cf6');
            $color_grad_end = get_option('psd_color_grad_end', '#d946ef');
            $color_cta_start = get_option('psd_color_cta_start', '#ec4899');
            $color_cta_end = get_option('psd_color_cta_end', '#f43f5e');

            $ad_code_top = get_option('psd_ad_code_top', '');
            $ad_code_bottom = get_option('psd_ad_code_bottom', '');
            $custom_css = get_option('psd_custom_css', '');
            $custom_js = get_option('psd_custom_js', '');

            $enable_youtube = get_option('psd_enable_youtube', '1');
            $enable_tiktok = get_option('psd_enable_tiktok', '1');
            $enable_instagram = get_option('psd_enable_instagram', '1');
            $enable_facebook = get_option('psd_enable_facebook', '1');
            $enable_twitter = get_option('psd_enable_twitter', '1');
            $enable_pinterest = get_option('psd_enable_pinterest', '1');
            $enable_reddit = get_option('psd_enable_reddit', '1');
            $enable_terabox = get_option('psd_enable_terabox', '1');
            $default_theme = get_option('psd_theme', 'glass');
            ?>
            <div class="wrap psd-admin-wrap">
                <div class="psd-admin-container">
                    <header class="psd-admin-header">
                        <div class="brand-logo">
                            <span class="logo-badge">GID</span>
                            <div>
                                <h1>Social Video Downloader Pro</h1>
                                <p class="subtitle">Official WordPress Plugin for GetIntoDevice.com &amp; Social Downloader</p>
                            </div>
                        </div>
                    </header>

                    <div class="psd-admin-grid">
                        <main class="psd-admin-main">
                            <form method="post" action="">
                                <?php wp_nonce_field('psd_settings_verify'); ?>

                                <div class="psd-card">
                                    <h2>🔌 Backend API Settings</h2>
                                    <div class="form-group">
                                        <label for="psd_api_base">API Base URL</label>
                                        <input type="url" id="psd_api_base" name="psd_api_base" value="<?php echo esc_url($api_base); ?>" placeholder="https://social-downloader-pro.netlify.app" class="regular-text" required />
                                        <p class="description">Live backend API server. Default is <code>https://social-downloader-pro.netlify.app</code></p>
                                    </div>

                                    <div class="form-group">
                                        <label for="psd_brand_suffix">Downloaded File Suffix</label>
                                        <input type="text" id="psd_brand_suffix" name="psd_brand_suffix" value="<?php echo esc_attr($brand_suffix); ?>" placeholder="GetIntoDevice" class="regular-text" required />
                                        <p class="description">Appended to saved video names (e.g. <code>Video Title - GetIntoDevice.mp4</code>).</p>
                                    </div>
                                </div>

                                <div class="psd-card">
                                    <h2>📝 Frontend Headings</h2>
                                    <div class="form-group">
                                        <label for="psd_hero_title">Downloader Heading</label>
                                        <input type="text" id="psd_hero_title" name="psd_hero_title" value="<?php echo esc_attr($hero_title); ?>" class="regular-text" />
                                    </div>
                                    <div class="form-group">
                                        <label for="psd_hero_subtitle">Downloader Subtitle</label>
                                        <textarea id="psd_hero_subtitle" name="psd_hero_subtitle" rows="2" class="large-text"><?php echo esc_textarea($hero_subtitle); ?></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label for="psd_theme">Theme Preset</label>
                                        <select id="psd_theme" name="psd_theme">
                                            <option value="glass" <?php selected($default_theme, 'glass'); ?>>Premium Glassmorphic (Dark Glow)</option>
                                            <option value="dark" <?php selected($default_theme, 'dark'); ?>>Solid Dark</option>
                                            <option value="light" <?php selected($default_theme, 'light'); ?>>Clean Light</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="psd-card">
                                    <h2>🌐 Supported Platform Chips</h2>
                                    <p class="section-intro">Choose which platform chips to display above/below the input box.</p>
                                    <div class="checkbox-group">
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_tiktok" value="1" <?php checked($enable_tiktok, '1'); ?> /><span>TikTok</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_instagram" value="1" <?php checked($enable_instagram, '1'); ?> /><span>Instagram</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_facebook" value="1" <?php checked($enable_facebook, '1'); ?> /><span>Facebook</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_youtube" value="1" <?php checked($enable_youtube, '1'); ?> /><span>YouTube</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_twitter" value="1" <?php checked($enable_twitter, '1'); ?> /><span>X / Twitter</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_pinterest" value="1" <?php checked($enable_pinterest, '1'); ?> /><span>Pinterest</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_reddit" value="1" <?php checked($enable_reddit, '1'); ?> /><span>Reddit</span></label>
                                        <label class="checkbox-label"><input type="checkbox" name="psd_enable_terabox" value="1" <?php checked($enable_terabox, '1'); ?> /><span>TeraBox</span></label>
                                    </div>
                                </div>

                                <div class="psd-card">
                                    <h2>🎨 Accent &amp; Button Colors</h2>
                                    <div class="color-picker-grid">
                                        <div class="color-picker-item">
                                            <label>Accent Color</label>
                                            <input type="text" name="psd_color_accent" value="<?php echo esc_attr($color_accent); ?>" class="psd-color-picker" />
                                        </div>
                                        <div class="color-picker-item">
                                            <label>Primary Gradient Start</label>
                                            <input type="text" name="psd_color_grad_start" value="<?php echo esc_attr($color_grad_start); ?>" class="psd-color-picker" />
                                        </div>
                                        <div class="color-picker-item">
                                            <label>Primary Gradient End</label>
                                            <input type="text" name="psd_color_grad_end" value="<?php echo esc_attr($color_grad_end); ?>" class="psd-color-picker" />
                                        </div>
                                        <div class="color-picker-item">
                                            <label>CTA High Quality Button Start</label>
                                            <input type="text" name="psd_color_cta_start" value="<?php echo esc_attr($color_cta_start); ?>" class="psd-color-picker" />
                                        </div>
                                        <div class="color-picker-item">
                                            <label>CTA High Quality Button End</label>
                                            <input type="text" name="psd_color_cta_end" value="<?php echo esc_attr($color_cta_end); ?>" class="psd-color-picker" />
                                        </div>
                                    </div>
                                </div>

                                <div class="psd-card">
                                    <h2>💰 Ad Monetization Slots</h2>
                                    <div class="form-group">
                                        <label for="psd_ad_code_top">Top Banner Ad (Above Search Box)</label>
                                        <textarea id="psd_ad_code_top" name="psd_ad_code_top" rows="3" class="large-text code-textarea" placeholder="Paste AdSense, Ezoic, or custom banner HTML/JS script here..."><?php echo esc_textarea($ad_code_top); ?></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label for="psd_ad_code_bottom">Bottom Banner Ad (Below Results)</label>
                                        <textarea id="psd_ad_code_bottom" name="psd_ad_code_bottom" rows="3" class="large-text code-textarea" placeholder="Paste AdSense banner HTML/JS script here..."><?php echo esc_textarea($ad_code_bottom); ?></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label for="psd_custom_css">Custom CSS Overrides</label>
                                        <textarea id="psd_custom_css" name="psd_custom_css" rows="3" class="large-text code-textarea" placeholder=".psd-app-shell { max-width: 1000px; }"><?php echo esc_textarea($custom_css); ?></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label for="psd_custom_js">Custom Tracking JS / Analytics</label>
                                        <textarea id="psd_custom_js" name="psd_custom_js" rows="3" class="large-text code-textarea" placeholder="console.log('Downloader loaded!');"><?php echo esc_textarea($custom_js); ?></textarea>
                                    </div>
                                </div>

                                <div class="submit-wrapper">
                                    <input type="submit" name="psd_save_settings" class="button button-primary psd-submit-btn" value="Save All Changes" />
                                </div>
                            </form>
                        </main>

                        <aside class="psd-admin-sidebar">
                            <div class="psd-card psd-status-card">
                                <h3>API Connection Status</h3>
                                <div class="status-indicator">
                                    <span class="status-dot pinging"></span>
                                    <span id="api-status-text">Checking Netlify API...</span>
                                </div>
                            </div>

                            <div class="psd-card">
                                <h3>📋 Shortcodes</h3>
                                <p>Paste this shortcode on any post, page, or Elementor block:</p>
                                <div class="psd-shortcode-box">
                                    <code>[social_downloader]</code>
                                    <button type="button" onclick="navigator.clipboard.writeText('[social_downloader]'); alert('Shortcode copied!');" class="psd-copy-shortcode">Copy</button>
                                </div>
                                <h4 style="margin-top:16px; margin-bottom:6px;">Dedicated Page Examples:</h4>
                                <ul style="list-style:disc; padding-left:18px; margin:0; font-size:12px; color:#64748b; line-height:1.7;">
                                    <li><code>[social_downloader title="Facebook Video Downloader" platform="facebook"]</code></li>
                                    <li><code>[social_downloader title="TikTok Video Downloader Without Watermark" platform="tiktok"]</code></li>
                                    <li><code>[social_downloader title="Instagram Reels Downloader" platform="instagram"]</code></li>
                                </ul>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>

            <script>
            jQuery(document).ready(function($){
                $('.psd-color-picker').wpColorPicker();
                const apiBase = '<?php echo esc_js($api_base); ?>';
                const statusDot = $('.status-dot');
                const statusText = $('#api-status-text');

                fetch(apiBase + '/api/video-info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: 'https://www.facebook.com/reel/1373845439143003' })
                })
                .then(res => {
                    statusDot.removeClass('pinging');
                    if (res.ok) {
                        statusDot.addClass('online');
                        statusText.text('Connected & Operational');
                    } else {
                        statusDot.addClass('offline');
                        statusText.text('API Responded: ' + res.status);
                    }
                })
                .catch(err => {
                    statusDot.removeClass('pinging').addClass('offline');
                    statusText.text('Offline / Connection Blocked');
                });
            });
            </script>
            <?php
        }

        public function render_downloader($atts) {
            $options_title = get_option('psd_hero_title', 'All-in-One Social Video Downloader');
            $options_subtitle = get_option('psd_hero_subtitle', 'Fast, free & high quality video & MP3 audio download from TikTok, Instagram, Facebook, YouTube, X and 40+ platforms.');

            $atts = shortcode_atts(array(
                'title'       => $options_title,
                'subtitle'    => $options_subtitle,
                'platform'    => 'all',
                'theme'       => get_option('psd_theme', 'glass'),
                'api_url'     => '',
                'show_chips'  => '1'
            ), $atts, 'social_downloader');

            $color_accent = get_option('psd_color_accent', '#8b5cf6');
            $color_grad_start = get_option('psd_color_grad_start', '#8b5cf6');
            $color_grad_end = get_option('psd_color_grad_end', '#d946ef');
            $color_cta_start = get_option('psd_color_cta_start', '#ec4899');
            $color_cta_end = get_option('psd_color_cta_end', '#f43f5e');

            $ad_code_top = get_option('psd_ad_code_top', '');
            $ad_code_bottom = get_option('psd_ad_code_bottom', '');
            $custom_css = get_option('psd_custom_css', '');
            $custom_js = get_option('psd_custom_js', '');

            $enable_youtube = get_option('psd_enable_youtube', '1');
            $enable_tiktok = get_option('psd_enable_tiktok', '1');
            $enable_instagram = get_option('psd_enable_instagram', '1');
            $enable_facebook = get_option('psd_enable_facebook', '1');
            $enable_twitter = get_option('psd_enable_twitter', '1');
            $enable_pinterest = get_option('psd_enable_pinterest', '1');
            $enable_reddit = get_option('psd_enable_reddit', '1');
            $enable_terabox = get_option('psd_enable_terabox', '1');

            ob_start();
            ?>
            <style>
            .psd-app-shell {
                --accent: <?php echo esc_html($color_accent); ?> !important;
                --theme-accent: <?php echo esc_html($color_accent); ?> !important;
                --theme-button: linear-gradient(135deg, <?php echo esc_html($color_grad_start); ?>, <?php echo esc_html($color_grad_end); ?>) !important;
                --theme-cta: linear-gradient(135deg, <?php echo esc_html($color_cta_start); ?>, <?php echo esc_html($color_cta_end); ?>) !important;
            }
            <?php if (!empty($custom_css)) { echo esc_html($custom_css); } ?>
            </style>

            <div class="psd-app-shell" data-theme="<?php echo esc_attr($atts['theme']); ?>" <?php if (!empty($atts['api_url'])) { echo 'data-api-base="' . esc_url($atts['api_url']) . '"'; } ?>>
                <div class="ambient-glow bg-glow-1" aria-hidden="true"></div>
                <div class="ambient-glow bg-glow-2" aria-hidden="true"></div>
                <div class="ambient-glow bg-glow-3" aria-hidden="true"></div>

                <div class="psd-tool-container">
                    <!-- Hero Headings -->
                    <div class="psd-hero-header">
                        <div class="psd-hero-badge">
                            <span class="psd-badge-dot"></span>
                            <span>FREE ALL-IN-ONE DOWNLOADER</span>
                        </div>
                        <h1 class="psd-main-title"><?php echo esc_html($atts['title']); ?></h1>
                        <p class="psd-main-subtitle"><?php echo esc_html($atts['subtitle']); ?></p>
                    </div>

                    <!-- Top Banner Ad Integration -->
                    <?php if (!empty($ad_code_top)): ?>
                        <div class="psd-ad-container psd-ad-top">
                            <?php echo $ad_code_top; ?>
                        </div>
                    <?php endif; ?>

                    <!-- Form Container -->
                    <section class="psd-hero">
                        <form id="download-form" action="javascript:void(0);" method="POST" onsubmit="event.preventDefault(); return false;" class="download-form glass-panel">
                            <label for="url-input" class="form-label">
                                <span class="material-symbols-outlined label-icon">link</span>
                                <span>Paste Media Link</span>
                            </label>
                            <div class="input-row">
                                <div class="input-wrapper">
                                    <span class="material-symbols-outlined search-icon">search</span>
                                    <input
                                        id="url-input"
                                        name="url"
                                        type="url"
                                        placeholder="Paste TikTok, Facebook, Instagram, YouTube, X link..."
                                        autocomplete="off"
                                        required
                                    />
                                    <div class="input-actions-group">
                                        <button type="button" id="btn-clear-url" class="input-action-btn clear-btn" aria-label="Clear link input" title="Clear input" style="display: none;">
                                            <span class="material-symbols-outlined">close</span>
                                        </button>
                                        <button type="button" id="btn-paste-url" class="input-action-btn paste-btn" aria-label="Paste from clipboard" title="Paste link">
                                            <span class="material-symbols-outlined">content_paste</span>
                                            <span>Paste</span>
                                        </button>
                                    </div>
                                </div>
                                <button id="fetch-button" type="submit" class="fetch-cta-button">
                                    <span class="material-symbols-outlined btn-icon">download</span>
                                    <span>Download</span>
                                </button>
                            </div>
                            <p id="status" class="status" role="status"></p>
                        </form>

                        <!-- Supported Platform Quick Chips -->
                        <?php if ($atts['show_chips'] === '1'): ?>
                            <div class="hero-platform-chips" aria-label="Quick platform shortcuts">
                                <?php if ($enable_tiktok === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="tiktok">
                                        <span class="chip-dot" style="background: #00f2fe;"></span><span>TikTok</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_instagram === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="instagram">
                                        <span class="chip-dot" style="background: #e1306c;"></span><span>Instagram</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_facebook === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="facebook">
                                        <span class="chip-dot" style="background: #1877f2;"></span><span>Facebook</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_youtube === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="youtube">
                                        <span class="chip-dot" style="background: #ff0000;"></span><span>YouTube</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_twitter === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="twitter">
                                        <span class="chip-dot" style="background: #ffffff;"></span><span>X</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_pinterest === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="pinterest">
                                        <span class="chip-dot" style="background: #e60023;"></span><span>Pinterest</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_reddit === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="reddit">
                                        <span class="chip-dot" style="background: #ff4500;"></span><span>Reddit</span>
                                    </button>
                                <?php endif; ?>
                                <?php if ($enable_terabox === '1'): ?>
                                    <button type="button" class="platform-chip" data-platform="terabox">
                                        <span class="chip-dot" style="background: #0ea5e9;"></span><span>TeraBox</span>
                                    </button>
                                <?php endif; ?>
                            </div>
                        <?php endif; ?>
                    </section>

                    <!-- Real-time Animated Loading Spinner -->
                    <div id="loader" class="loader glass-panel" hidden>
                        <div class="loader-orb">
                            <div class="spinner" aria-hidden="true"></div>
                            <span id="loader-percent">0%</span>
                        </div>
                        <div class="loader-copy">
                            <p id="loader-title">Analyzing media link...</p>
                            <span id="loader-detail">Connecting to servers and extracting HD formats</span>
                            <div class="progress-track" aria-hidden="true">
                                <span id="progress-bar"></span>
                            </div>
                            <div id="process-steps" class="process-steps" aria-label="Analyze process">
                                <span data-step="0">Validate link</span>
                                <span data-step="1">Detect platform</span>
                                <span data-step="2">Read metadata</span>
                                <span data-step="3">Prepare 100% MP4</span>
                            </div>
                        </div>
                    </div>

                    <!-- Result Section -->
                    <section id="result" class="result command-center" hidden>
                        <div class="preview-console glass-panel">
                            <div class="preview-media">
                                <video id="smart-preview" controls playsinline preload="metadata" hidden></video>
                                <img id="thumbnail" alt="Video thumbnail" />
                                <span id="platform-icon" class="platform-icon platform-generic" aria-hidden="true">SD</span>
                            </div>

                            <div class="preview-details">
                                <div id="result-badges" class="result-badges"></div>
                                <p class="eyebrow">Ready for Download</p>
                                <h2 id="title"></h2>
                                <p id="description" class="preview-desc" style="display: none;"></p>
                                <p id="count"></p>
                                <div id="media-stats-box" class="media-stats-box" style="display: none;">
                                    <div class="media-stat-card">
                                        <span class="material-symbols-outlined">visibility</span>
                                        <div class="media-stat-text"><span id="stat-views">-</span><small>Views</small></div>
                                    </div>
                                    <div class="media-stat-card">
                                        <span class="material-symbols-outlined">favorite</span>
                                        <div class="media-stat-text"><span id="stat-likes">-</span><small>Likes</small></div>
                                    </div>
                                    <div class="media-stat-card">
                                        <span class="material-symbols-outlined">share</span>
                                        <div class="media-stat-text"><span id="stat-shares">-</span><small>Shares</small></div>
                                    </div>
                                    <div class="media-stat-card">
                                        <span class="material-symbols-outlined">schedule</span>
                                        <div class="media-stat-text"><span id="stat-duration">-</span><small>Duration</small></div>
                                    </div>
                                </div>
                                <a id="source-link" class="source-link" href="#" target="_blank" rel="noreferrer">
                                    <span class="material-symbols-outlined link-icon">open_in_new</span>
                                    <span>Original Post</span>
                                </a>
                            </div>
                        </div>

                        <!-- Primary Download Action Cards -->
                        <div class="primary-actions glass-panel" aria-label="Primary downloads">
                            <a id="high-download" class="primary-action action-high" href="#">
                                <span class="material-symbols-outlined action-icon">hd</span>
                                <span class="action-label">Best MP4 Quality</span>
                                <small id="high-meta">Best video</small>
                            </a>
                            <a id="normal-download" class="primary-action action-normal" href="#">
                                <span class="material-symbols-outlined action-icon">video_file</span>
                                <span class="action-label">Normal MP4</span>
                                <small id="normal-meta">Smaller video</small>
                            </a>
                            <a id="audio-download" class="primary-action action-audio" href="#">
                                <span class="material-symbols-outlined action-icon">audiotrack</span>
                                <span class="action-label">Audio MP3</span>
                                <small id="audio-meta">Download MP3</small>
                            </a>
                            <a id="thumbnail-download" class="primary-action action-thumb" href="#">
                                <span class="material-symbols-outlined action-icon">image</span>
                                <span class="action-label">HD Thumbnail</span>
                                <small id="thumb-meta">Cover image</small>
                            </a>
                        </div>

                        <!-- Creator Details Panel -->
                        <div id="creator-card" class="creator-card profile-panel glass-panel" hidden>
                            <div class="creator-avatar" id="creator-avatar">SD</div>
                            <div class="creator-main">
                                <p class="eyebrow">Verified Creator</p>
                                <h2 id="creator-name"></h2>
                                <p id="creator-handle"></p>
                            </div>
                            <div id="creator-stats" class="creator-stats"></div>
                            <a id="creator-link" class="source-link" href="#" target="_blank" rel="noreferrer" hidden>
                                <span class="material-symbols-outlined link-icon">account_circle</span>
                                <span>View profile</span>
                            </a>
                        </div>

                        <!-- More Formats Accordion -->
                        <details class="more-formats glass-panel">
                            <summary>
                                <div class="summary-title-wrapper">
                                    <span class="material-symbols-outlined summary-icon">tune</span>
                                    <span>All Available Formats &amp; Bitrates</span>
                                </div>
                                <small>Full resolution breakdown</small>
                            </summary>
                            <div class="output-console">
                                <div id="output-summary" class="output-summary"></div>
                                <div class="output-tools" aria-label="Output filters">
                                    <button class="filter-chip active" type="button" data-filter="all">All</button>
                                    <button class="filter-chip" type="button" data-filter="video">Video</button>
                                    <button class="filter-chip" type="button" data-filter="audio">Audio</button>
                                    <button class="filter-chip" type="button" data-filter="image">Images</button>
                                </div>
                            </div>
                            <div id="options" class="options"></div>
                        </details>
                    </section>

                    <!-- Bottom Banner Ad Integration -->
                    <?php if (!empty($ad_code_bottom)): ?>
                        <div class="psd-ad-container psd-ad-bottom">
                            <?php echo $ad_code_bottom; ?>
                        </div>
                    <?php endif; ?>
                </div>

                <!-- Media Preview Modal -->
                <div id="preview-modal" class="preview-modal" hidden>
                    <div class="preview-modal-backdrop" id="preview-modal-backdrop"></div>
                    <div class="preview-modal-content">
                        <button type="button" class="preview-modal-close" id="preview-modal-close" aria-label="Close Preview">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                        <h3 id="preview-modal-title">Media Preview</h3>
                        <div class="preview-modal-player" id="preview-modal-player"></div>
                    </div>
                </div>

                <!-- Toast Notification Container -->
                <div id="psd-toast" class="psd-toast" style="display: none;"></div>
            </div>

            <!-- Custom JS Injection -->
            <?php if (!empty($custom_js)): ?>
                <script>
                try {
                    <?php echo $custom_js; ?>
                } catch (e) {
                    console.error("Custom JS Error:", e);
                }
                </script>
            <?php endif; ?>
            <?php
            return ob_get_clean();
        }
    }

    new SocialDownloaderApp();
}
