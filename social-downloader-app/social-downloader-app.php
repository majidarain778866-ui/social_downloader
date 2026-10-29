<?php
/**
 * Plugin Name: Social Downloader App
 * Plugin URI: https://socialdownloader.app
 * Description: Embed a fast, beautiful, glassmorphic social media video and audio downloader (supporting TikTok, Instagram, YouTube, Facebook, X, Pinterest, and 40+ more platforms) using the shortcode [social_downloader].
 * Version: 1.1.0
 * Author: Social Downloader Team
 * Author URI: https://socialdownloader.app
 * License: GPL2
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

if (!defined('PSD_VERSION')) {
    define('PSD_VERSION', '1.1.0');
}

if (!class_exists('SocialDownloaderApp')) {
    class SocialDownloaderApp {

    public function __construct() {
        add_shortcode('social_downloader', array($this, 'render_downloader'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    public function enqueue_assets() {
        // Enqueue Google Fonts
        wp_enqueue_style('psd-google-fonts', 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap', array(), null);
        
        // Enqueue Material Icons
        wp_enqueue_style('psd-material-icons', 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200', array(), null);

        // Enqueue custom CSS
        wp_enqueue_style('psd-styles', plugin_dir_url(__FILE__) . 'assets/css/styles.css', array(), PSD_VERSION);

        // Enqueue custom JS
        wp_enqueue_script('psd-app', plugin_dir_url(__FILE__) . 'assets/js/app.js', array(), PSD_VERSION, true);

        // Localize script to pass options dynamically from WordPress database
        wp_localize_script('psd-app', 'psdSettings', array(
            'apiBase' => get_option('psd_api_base', 'https://socialdownloader.app'),
            'brandSuffix' => get_option('psd_brand_suffix', 'Social Downloader'),
            'enableYoutube' => get_option('psd_enable_youtube', '1'),
            'enableTiktok' => get_option('psd_enable_tiktok', '1'),
            'enableInstagram' => get_option('psd_enable_instagram', '1'),
            'enableFacebook' => get_option('psd_enable_facebook', '1'),
            'enableTwitter' => get_option('psd_enable_twitter', '1')
        ));
    }

    public function enqueue_admin_assets($hook) {
        if ($hook !== 'toplevel_page_social-downloader') {
            return;
        }
        // Enqueue Google Fonts
        wp_enqueue_style('psd-admin-fonts', 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap', array(), null);
        
        // Enqueue Color Picker assets
        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');

        // Enqueue custom Admin Stylesheet
        wp_enqueue_style('psd-admin-styles', plugin_dir_url(__FILE__) . 'assets/css/admin-styles.css', array(), PSD_VERSION);
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
        // Handle Options Saving
        if (isset($_POST['psd_save_settings']) && check_admin_referer('psd_settings_verify')) {
            update_option('psd_api_base', esc_url_raw(rtrim($_POST['psd_api_base'], '/')));
            update_option('psd_brand_suffix', sanitize_text_field($_POST['psd_brand_suffix']));
            update_option('psd_color_accent', sanitize_hex_color($_POST['psd_color_accent']));
            update_option('psd_color_grad_start', sanitize_hex_color($_POST['psd_color_grad_start']));
            update_option('psd_color_grad_end', sanitize_hex_color($_POST['psd_color_grad_end']));
            update_option('psd_color_cta_start', sanitize_hex_color($_POST['psd_color_cta_start']));
            update_option('psd_color_cta_end', sanitize_hex_color($_POST['psd_color_cta_end']));
            
            // New Advanced Settings
            update_option('psd_ad_code', $_POST['psd_ad_code']); // Allowed HTML/JS for ads
            update_option('psd_custom_css', strip_tags($_POST['psd_custom_css']));
            update_option('psd_custom_js', $_POST['psd_custom_js']);
            update_option('psd_enable_youtube', isset($_POST['psd_enable_youtube']) ? '1' : '0');
            update_option('psd_enable_tiktok', isset($_POST['psd_enable_tiktok']) ? '1' : '0');
            update_option('psd_enable_instagram', isset($_POST['psd_enable_instagram']) ? '1' : '0');
            update_option('psd_enable_facebook', isset($_POST['psd_enable_facebook']) ? '1' : '0');
            update_option('psd_enable_twitter', isset($_POST['psd_enable_twitter']) ? '1' : '0');
            update_option('psd_theme', sanitize_text_field($_POST['psd_theme']));

            echo '<div class="notice notice-success is-dismissible"><p>Settings saved successfully!</p></div>';
        }

        $api_base = get_option('psd_api_base', 'https://socialdownloader.app');
        $brand_suffix = get_option('psd_brand_suffix', 'Social Downloader');
        $color_accent = get_option('psd_color_accent', '#8b5cf6');
        $color_grad_start = get_option('psd_color_grad_start', '#8b5cf6');
        $color_grad_end = get_option('psd_color_grad_end', '#d946ef');
        $color_cta_start = get_option('psd_color_cta_start', '#ec4899');
        $color_cta_end = get_option('psd_color_cta_end', '#f43f5e');

        // New Advanced Settings Values
        $ad_code = get_option('psd_ad_code', '');
        $custom_css = get_option('psd_custom_css', '');
        $custom_js = get_option('psd_custom_js', '');
        $enable_youtube = get_option('psd_enable_youtube', '1');
        $enable_tiktok = get_option('psd_enable_tiktok', '1');
        $enable_instagram = get_option('psd_enable_instagram', '1');
        $enable_facebook = get_option('psd_enable_facebook', '1');
        $enable_twitter = get_option('psd_enable_twitter', '1');
        $default_theme = get_option('psd_theme', 'glass');
        ?>
        <div class="wrap psd-admin-wrap">
            <div class="psd-admin-container">
                <!-- Header -->
                <header class="psd-admin-header">
                    <div class="brand-logo">
                        <span class="logo-badge">SD</span>
                        <div>
                            <h1>Social Downloader Dashboard</h1>
                            <p class="subtitle">Manage settings, custom branding, styling, and monetization</p>
                        </div>
                    </div>
                </header>

                <div class="psd-admin-grid">
                    <!-- Settings Form -->
                    <main class="psd-admin-main">
                        <form method="post" action="">
                            <?php wp_nonce_field('psd_settings_verify'); ?>
                            
                            <div class="psd-card">
                                <h2>General Settings</h2>
                                
                                <div class="form-group">
                                    <label for="psd_api_base">API Base URL</label>
                                    <input type="url" id="psd_api_base" name="psd_api_base" value="<?php echo esc_url($api_base); ?>" placeholder="https://socialdownloader.app" class="regular-text" required />
                                    <p class="description">Enter the URL of your live backend API deployment.</p>
                                </div>

                                <div class="form-group">
                                    <label for="psd_brand_suffix">File Download Suffix</label>
                                    <input type="text" id="psd_brand_suffix" name="psd_brand_suffix" value="<?php echo esc_attr($brand_suffix); ?>" placeholder="Social Downloader" class="regular-text" required />
                                    <p class="description">This string is appended to all downloaded filenames (e.g. video - Social Downloader.mp4).</p>
                                </div>

                                <div class="form-group">
                                    <label for="psd_theme">Default Theme Preset</label>
                                    <select id="psd_theme" name="psd_theme">
                                        <option value="glass" <?php selected($default_theme, 'glass'); ?>>Glassmorphism (Default)</option>
                                        <option value="dark" <?php selected($default_theme, 'dark'); ?>>Solid Dark</option>
                                        <option value="light" <?php selected($default_theme, 'light'); ?>>Solid Light</option>
                                        <option value="minimal" <?php selected($default_theme, 'minimal'); ?>>Flat Minimal</option>
                                    </select>
                                    <p class="description">Select the default theme. You can override this on specific pages using <code>[social_downloader theme="light"]</code></p>
                                </div>
                            </div>

                            <div class="psd-card">
                                <h2>Supported Platforms</h2>
                                <p class="section-intro">Enable or disable download options for specific social media networks.</p>
                                
                                <div class="checkbox-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="psd_enable_youtube" value="1" <?php checked($enable_youtube, '1'); ?> />
                                        <span>YouTube Downloader</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="psd_enable_tiktok" value="1" <?php checked($enable_tiktok, '1'); ?> />
                                        <span>TikTok Downloader</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="psd_enable_instagram" value="1" <?php checked($enable_instagram, '1'); ?> />
                                        <span>Instagram Downloader</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="psd_enable_facebook" value="1" <?php checked($enable_facebook, '1'); ?> />
                                        <span>Facebook Downloader</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="psd_enable_twitter" value="1" <?php checked($enable_twitter, '1'); ?> />
                                        <span>Twitter / X Downloader</span>
                                    </label>
                                </div>
                            </div>

                            <div class="psd-card">
                                <h2>Color & Design Customization</h2>
                                <p class="section-intro">Style the frontend downloader to match your website theme's color palette.</p>

                                <div class="color-picker-grid">
                                    <div class="color-picker-item">
                                        <label>Accent Color</label>
                                        <input type="text" name="psd_color_accent" value="<?php echo esc_attr($color_accent); ?>" class="psd-color-picker" />
                                    </div>

                                    <div class="color-picker-item">
                                        <label>Gradient Start (Primary Button)</label>
                                        <input type="text" name="psd_color_grad_start" value="<?php echo esc_attr($color_grad_start); ?>" class="psd-color-picker" />
                                    </div>

                                    <div class="color-picker-item">
                                        <label>Gradient End (Primary Button)</label>
                                        <input type="text" name="psd_color_grad_end" value="<?php echo esc_attr($color_grad_end); ?>" class="psd-color-picker" />
                                    </div>

                                    <div class="color-picker-item">
                                        <label>CTA Gradient Start (High Quality Button)</label>
                                        <input type="text" name="psd_color_cta_start" value="<?php echo esc_attr($color_cta_start); ?>" class="psd-color-picker" />
                                    </div>

                                    <div class="color-picker-item">
                                        <label>CTA Gradient End (High Quality Button)</label>
                                        <input type="text" name="psd_color_cta_end" value="<?php echo esc_attr($color_cta_end); ?>" class="psd-color-picker" />
                                    </div>
                                </div>
                            </div>

                            <div class="psd-card">
                                <h2>Ad Integration & Code Injection</h2>
                                <p class="section-intro">Monetize your page with custom banner ads or inject tracking and analytic scripts.</p>

                                <div class="form-group">
                                    <label for="psd_ad_code">Banner Ad HTML Code</label>
                                    <textarea id="psd_ad_code" name="psd_ad_code" rows="5" class="large-text code-textarea" placeholder="Paste AdSense, Ezoic, or custom banner HTML/JS script here..."><?php echo esc_textarea($ad_code); ?></textarea>
                                    <p class="description">This banner ad will be displayed directly below the downloader input form.</p>
                                </div>

                                <div class="form-group">
                                    <label for="psd_custom_css">Custom CSS Override</label>
                                    <textarea id="psd_custom_css" name="psd_custom_css" rows="4" class="large-text code-textarea" placeholder=".psd-hero { padding: 40px; }"><?php echo esc_textarea($custom_css); ?></textarea>
                                    <p class="description">Write custom CSS styles to override any parts of the frontend downloader UI.</p>
                                </div>

                                <div class="form-group">
                                    <label for="psd_custom_js">Custom JavaScript / Analytics</label>
                                    <textarea id="psd_custom_js" name="psd_custom_js" rows="4" class="large-text code-textarea" placeholder="console.log('Downloader loaded!');"><?php echo esc_textarea($custom_js); ?></textarea>
                                    <p class="description">Inject custom tracking scripts or analytic tags (e.g. Google Analytics).</p>
                                </div>
                            </div>

                            <div class="submit-wrapper">
                                <input type="submit" name="psd_save_settings" class="button button-primary psd-submit-btn" value="Save Changes" />
                            </div>
                        </form>
                    </main>

                    <!-- Sidebar Info / Guide -->
                    <aside class="psd-admin-sidebar">
                        <div class="psd-card psd-status-card">
                            <h3>API Status</h3>
                            <div class="status-indicator">
                                <span class="status-dot pinging"></span>
                                <span id="api-status-text">Checking Netlify API...</span>
                            </div>
                        </div>

                        <div class="psd-card">
                            <h3>How to Use</h3>
                            <p>To display the downloader on your website, copy and paste this shortcode on any WordPress post or page:</p>
                            <div class="psd-shortcode-box">
                                <code>[social_downloader]</code>
                                <button type="button" onclick="navigator.clipboard.writeText('[social_downloader]'); alert('Shortcode copied!');" class="psd-copy-shortcode">Copy</button>
                            </div>
                            <p class="description">You can create dedicated pages for different platforms (e.g. YouTube Downloader, TikTok Downloader) and place the shortcode inside them.</p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>

        <script>
        jQuery(document).ready(function($){
            // Init WP Color Pickers
            $('.psd-color-picker').wpColorPicker();

            // Perform API Status Check
            const apiBase = '<?php echo esc_js($api_base); ?>';
            const statusDot = $('.status-dot');
            const statusText = $('#api-status-text');

            statusText.text('Connecting...');
            
            // Call metadata API with mock URL to check connectivity
            fetch(apiBase + '/api/video-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' })
            })
            .then(res => {
                statusDot.removeClass('pinging');
                if (res.ok) {
                    statusDot.addClass('online');
                    statusText.text('Online & Connected');
                } else {
                    statusDot.addClass('offline');
                    statusText.text('API Online, but returned ' + res.status);
                }
            })
            .catch(err => {
                statusDot.removeClass('pinging').addClass('offline');
                statusText.text('Offline (Connection Failed)');
                console.error(err);
            });
        });
        </script>
        <?php
    }

    public function render_downloader($atts) {
        $color_accent = get_option('psd_color_accent', '#8b5cf6');
        $color_grad_start = get_option('psd_color_grad_start', '#8b5cf6');
        $color_grad_end = get_option('psd_color_grad_end', '#d946ef');
        $color_cta_start = get_option('psd_color_cta_start', '#ec4899');
        $color_cta_end = get_option('psd_color_cta_end', '#f43f5e');

        $ad_code = get_option('psd_ad_code', '');
        $custom_css = get_option('psd_custom_css', '');
        $custom_js = get_option('psd_custom_js', '');

        ob_start();
        ?>
        <!-- Inline style block to apply customized dashboard colors and overrides -->
        <style>
        .psd-app-shell {
            --accent: <?php echo esc_html($color_accent); ?> !important;
            --theme-accent: <?php echo esc_html($color_accent); ?> !important;
            --theme-button: linear-gradient(135deg, <?php echo esc_html($color_grad_start); ?>, <?php echo esc_html($color_grad_end); ?>) !important;
            --theme-cta: linear-gradient(135deg, <?php echo esc_html($color_cta_start); ?>, <?php echo esc_html($color_cta_end); ?>) !important;
            --theme-a: rgba(139, 92, 246, 0.16);
            --theme-b: rgba(217, 70, 239, 0.12);
        }
        <?php if (!empty($custom_css)) { echo esc_html($custom_css); } ?>
        </style>

        <div class="psd-app-shell" style="border-radius: 24px; margin: 32px 0; overflow: hidden; position: relative; box-shadow: 0 30px 80px rgba(0,0,0,0.5); padding: 48px 24px;">
            <!-- Glow Backdrops -->
            <div class="ambient-glow bg-glow-1" aria-hidden="true"></div>
            <div class="ambient-glow bg-glow-2" aria-hidden="true"></div>
            <div class="ambient-glow bg-glow-3" aria-hidden="true"></div>

            <div class="psd-tool-container" style="max-width: 900px; margin: 0 auto; position: relative; z-index: 2;">
                <!-- Form Container -->
                <section class="psd-hero" style="margin-bottom: 24px;">
                    <form id="download-form" action="javascript:void(0);" method="POST" onsubmit="event.preventDefault(); return false;" class="download-form glass-panel">
                        <label for="url-input" class="form-label">
                            <span class="material-symbols-outlined label-icon">link</span>
                            <span>Media URL</span>
                        </label>
                        <div class="input-row">
                            <div class="input-wrapper">
                                <span class="material-symbols-outlined search-icon">search</span>
                                <input
                                    id="url-input"
                                    name="url"
                                    type="url"
                                    placeholder="Paste TikTok, Instagram, YouTube, Facebook, X..."
                                    autocomplete="off"
                                    required
                                />
                            </div>
                            <button id="fetch-button" type="submit">
                                <span class="material-symbols-outlined btn-icon">analytics</span>
                                <span>Analyze</span>
                            </button>
                        </div>
                        <p id="status" class="status" role="status"></p>
                    </form>
                </section>

                <!-- Monetization Ad Integration -->
                <?php if (!empty($ad_code)): ?>
                    <div class="psd-ad-container-frontend" style="margin: 20px 0; text-align: center; max-width: 100%; overflow: hidden;">
                        <?php echo $ad_code; ?>
                    </div>
                <?php endif; ?>

                <!-- Loading Spinner -->
                <div id="loader" class="loader glass-panel" hidden>
                    <div class="loader-orb">
                        <div class="spinner" aria-hidden="true"></div>
                        <span id="loader-percent">0%</span>
                    </div>
                    <div class="loader-copy">
                        <p id="loader-title">Analyzing link...</p>
                        <span id="loader-detail">Preparing download options</span>
                        <div class="progress-track" aria-hidden="true">
                            <span id="progress-bar"></span>
                        </div>
                        <div id="process-steps" class="process-steps" aria-label="Analyze process">
                            <span data-step="0">Validate link</span>
                            <span data-step="1">Detect platform</span>
                            <span data-step="2">Read metadata</span>
                            <span data-step="3">Prepare assets</span>
                        </div>
                    </div>
                </div>

                <!-- Result Section -->
                <section id="result" class="result command-center" hidden>
                    <div class="preview-console glass-panel">
                        <div class="preview-media">
                            <video id="smart-preview" controls playsinline preload="metadata" hidden></video>
                            <img id="thumbnail" alt="" />
                            <span id="platform-icon" class="platform-icon platform-generic" aria-hidden="true">SD</span>
                        </div>

                        <div class="preview-details">
                            <div id="result-badges" class="result-badges"></div>
                            <p class="eyebrow">Live link preview</p>
                            <h2 id="title"></h2>
                            <p id="description" class="preview-desc" style="display: none;"></p>
                            <p id="count"></p>
                            <div id="media-stats-box" class="media-stats-box" style="display: none;">
                                <div class="media-stat-card">
                                    <span class="material-symbols-outlined">visibility</span>
                                    <div class="media-stat-text">
                                        <span id="stat-views">-</span>
                                        <small>Views</small>
                                    </div>
                                </div>
                                <div class="media-stat-card">
                                    <span class="material-symbols-outlined">favorite</span>
                                    <div class="media-stat-text">
                                        <span id="stat-likes">-</span>
                                        <small>Likes</small>
                                    </div>
                                </div>
                                <div class="media-stat-card">
                                    <span class="material-symbols-outlined">share</span>
                                    <div class="media-stat-text">
                                        <span id="stat-shares">-</span>
                                        <small>Shares</small>
                                    </div>
                                </div>
                                <div class="media-stat-card">
                                    <span class="material-symbols-outlined">schedule</span>
                                    <div class="media-stat-text">
                                        <span id="stat-duration">-</span>
                                        <small>Duration</small>
                                    </div>
                                </div>
                            </div>
                            <a id="source-link" class="source-link" href="#" target="_blank" rel="noreferrer">
                                <span class="material-symbols-outlined link-icon">open_in_new</span>
                                <span>Open source</span>
                            </a>
                        </div>
                    </div>

                    <!-- Primary Download Cards -->
                    <div class="primary-actions glass-panel" aria-label="Primary downloads">
                        <a id="high-download" class="primary-action action-high" href="#">
                            <span class="material-symbols-outlined action-icon">hd</span>
                            <span class="action-label">High Quality</span>
                            <small id="high-meta">Best video</small>
                        </a>
                        <a id="normal-download" class="primary-action action-normal" href="#">
                            <span class="material-symbols-outlined action-icon">video_file</span>
                            <span class="action-label">Normal Quality</span>
                            <small id="normal-meta">Smaller video</small>
                        </a>
                        <a id="audio-download" class="primary-action action-audio" href="#">
                            <span class="material-symbols-outlined action-icon">audiotrack</span>
                            <span class="action-label">Audio MP3</span>
                            <small id="audio-meta">Download MP3</small>
                        </a>
                        <a id="thumbnail-download" class="primary-action action-thumb" href="#">
                            <span class="material-symbols-outlined action-icon">image</span>
                            <span class="action-label">Thumbnail HD</span>
                            <small id="thumb-meta">Preview image</small>
                        </a>
                    </div>

                    <!-- Creator Details -->
                    <div id="creator-card" class="creator-card profile-panel glass-panel" hidden>
                        <div class="creator-avatar" id="creator-avatar">SD</div>
                        <div class="creator-main">
                            <p class="eyebrow">Creator profile</p>
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
                                <span>More formats</span>
                            </div>
                            <small>Advanced video, audio, and image options</small>
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
            </div>
        </div>

        <!-- Custom JS Code Injection -->
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
