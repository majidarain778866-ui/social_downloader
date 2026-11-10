<?php
/**
 * Social Downloader - Uninstall Script
 * 
 * This file is run automatically by WordPress when the user deletes the plugin.
 * It cleans up all the saved settings from the database.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Delete all options from wp_options table
delete_option('psd_api_base');
delete_option('psd_brand_suffix');
delete_option('psd_hero_title');
delete_option('psd_hero_subtitle');
delete_option('psd_theme');
delete_option('psd_color_accent');
delete_option('psd_color_grad_start');
delete_option('psd_color_grad_end');
delete_option('psd_color_cta_start');
delete_option('psd_color_cta_end');
delete_option('psd_ad_code_top');
delete_option('psd_ad_code_bottom');
delete_option('psd_custom_css');
delete_option('psd_custom_js');
delete_option('psd_enable_youtube');
delete_option('psd_enable_tiktok');
delete_option('psd_enable_instagram');
delete_option('psd_enable_facebook');
delete_option('psd_enable_twitter');
delete_option('psd_enable_pinterest');
delete_option('psd_enable_reddit');
delete_option('psd_enable_terabox');
