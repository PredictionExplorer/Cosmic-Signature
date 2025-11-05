#!/usr/bin/env python3
"""
Analyze favorite images to identify parameter patterns.

This script helps you find optimal mean and std values for distributions
by analyzing your favorite images. Use the output to update constants in
src/parameter_distributions.rs.

The system now uses distribution-based sampling by default - this script
helps you tune those distributions based on your aesthetic preferences.
"""

import json
import statistics
from collections import defaultdict, Counter
from pathlib import Path
from typing import Dict, List, Any

# List of favorite images (from user)
FAVORITES = [
    "b26ff8a7f2bf_standard", "bac842dcb89a_special", "f17bb15dc0ce_standard",
    "f7a9d5b6b01f_standard", "f4df82acf367_special", "ef7539d6af2d_standard",
    "ebab5909c446_special", "ebb59e73bff7_standard", "eb5852f36f05_standard",
    "e2f76242e7ae_standard", "d0201040c6ad_standard", "c09dadad68f1_special",
    "c4abd6d98abb_standard", "c2def5c2eb1b_standard", "bcbe1a518c5a_standard",
    "b3ce3061982c_standard", "ada03fe6e762_standard", "8390270aea94_standard",
    "1257664d1d7e_special", "80010dea685f_special", "74991b4f0b8f_standard",
    "55777cf32162_special", "5639aae66b6b_standard", "997f2ac03477_special",
    "984fd1b61b3d_standard", "782f3d0103c4_standard", "492faaea43f7_special",
    "430c8685cbee_standard", "98c18c6bfbe4_standard", "74f8e67631c9_standard",
    "45ba248e2638_standard", "9fe40a92c656_special", "9e1a1ca18888_standard",
    "8b3b45f544a0_standard", "06c9c7571fca_standard", "5e8c2b42083b_standard",
    "5cdd8c540f08_standard", "4d815d98aa6d_standard", "4b11b54cc663_standard",
    "3f59aa02473b_standard", "3f11e6c4ccfd_standard", "3a233aa48bbc_special",
    "1a6905798028_special", "0b88164a70b2_standard"
]

def load_generation_log():
    """Load the generation log JSON file."""
    with open('generation_log.json', 'r') as f:
        return json.load(f)

def extract_favorites(log_data: List[Dict]) -> List[Dict]:
    """Extract entries matching favorite filenames."""
    favorites = []
    favorite_set = set(FAVORITES)
    
    for entry in log_data:
        if entry.get('file_name') in favorite_set:
            favorites.append(entry)
    
    return favorites

def analyze_effect_parameters(favorites: List[Dict]) -> Dict[str, Any]:
    """Analyze effect parameters across favorite images."""
    effect_params = defaultdict(lambda: defaultdict(list))
    effect_enabled = defaultdict(list)
    
    for entry in favorites:
        rand_log = entry.get('randomization_log', {})
        effects = rand_log.get('effects', [])
        
        for effect in effects:
            effect_name = effect.get('effect_name')
            enabled = effect.get('enabled', False)
            effect_enabled[effect_name].append(enabled)
            
            for param in effect.get('parameters', []):
                param_name = param.get('name')
                param_value = param.get('value')
                
                # Try to convert to float if possible
                try:
                    value = float(param_value)
                    effect_params[effect_name][param_name].append(value)
                except (ValueError, TypeError):
                    # Keep as string for categorical values
                    effect_params[effect_name][param_name].append(param_value)
    
    return dict(effect_params), dict(effect_enabled)

def analyze_drift(favorites: List[Dict]) -> Dict[str, List]:
    """Analyze drift configuration patterns."""
    drift_data = defaultdict(list)
    
    for entry in favorites:
        drift = entry.get('drift_config', {})
        if drift.get('enabled'):
            drift_data['mode'].append(drift.get('mode'))
            drift_data['scale'].append(drift.get('scale'))
            drift_data['arc_fraction'].append(drift.get('arc_fraction'))
            drift_data['orbit_eccentricity'].append(drift.get('orbit_eccentricity'))
    
    return dict(drift_data)

def analyze_simulation(favorites: List[Dict]) -> Dict[str, List]:
    """Analyze simulation configuration patterns."""
    sim_data = defaultdict(list)
    
    for entry in favorites:
        sim = entry.get('simulation_config', {})
        sim_data['num_sims'].append(sim.get('num_sims'))
        sim_data['chaos_weight'].append(sim.get('chaos_weight'))
        sim_data['equil_weight'].append(sim.get('equil_weight'))
        
        orbit = entry.get('orbit_info', {})
        sim_data['weighted_score'].append(orbit.get('weighted_score'))
    
    return dict(sim_data)

def compute_statistics(values: List[float]) -> Dict[str, float]:
    """Compute statistical measures for a list of values."""
    if not values:
        return {}
    
    return {
        'min': min(values),
        'max': max(values),
        'mean': statistics.mean(values),
        'median': statistics.median(values),
        'stdev': statistics.stdev(values) if len(values) > 1 else 0.0,
        'q1': statistics.quantiles(values, n=4)[0] if len(values) >= 4 else min(values),
        'q3': statistics.quantiles(values, n=4)[2] if len(values) >= 4 else max(values),
    }

def print_section(title: str):
    """Print a formatted section header."""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print('='*80)

def main():
    print("\n" + "="*80)
    print("  FAVORITE IMAGES PARAMETER ANALYSIS")
    print("="*80)
    
    # Load data
    print("\nLoading generation log...")
    log_data = load_generation_log()
    print(f"   Total entries: {len(log_data)}")
    
    # Extract favorites
    print(f"   Searching for {len(FAVORITES)} favorite images...")
    favorites = extract_favorites(log_data)
    print(f"   Found: {len(favorites)} matches")
    
    if len(favorites) != len(FAVORITES):
        found_names = {f['file_name'] for f in favorites}
        missing = set(FAVORITES) - found_names
        if missing:
            print(f"   WARNING: Missing {len(missing)} images: {list(missing)[:5]}...")
    
    # Analyze special vs standard mode
    print_section("MODE DISTRIBUTION")
    mode_counts = Counter(f.get('special_mode') for f in favorites)
    special_count = mode_counts.get(True, 0)
    standard_count = mode_counts.get(False, 0)
    total = special_count + standard_count
    
    print(f"\n   Special mode:  {special_count:2d} ({special_count/total*100:.1f}%)")
    print(f"   Standard mode: {standard_count:2d} ({standard_count/total*100:.1f}%)")
    
    # Analyze effects
    print_section("EFFECT ENABLE/DISABLE PATTERNS")
    effect_params, effect_enabled = analyze_effect_parameters(favorites)
    
    for effect_name, enabled_list in sorted(effect_enabled.items()):
        enabled_count = sum(enabled_list)
        disabled_count = len(enabled_list) - enabled_count
        print(f"\n   {effect_name:25s}: Enabled {enabled_count:2d} ({enabled_count/len(enabled_list)*100:5.1f}%)  |  Disabled {disabled_count:2d}")
    
    # Analyze key effect parameters
    print_section("KEY EFFECT PARAMETERS (Numeric Values)")
    
    important_params = [
        'chromatic_bloom_strength', 'chromatic_bloom_radius_scale',
        'glow_strength', 'glow_threshold', 'dog_strength',
        'perceptual_blur_strength', 'gradient_map_strength',
        'color_grade_strength', 'vignette_strength', 'vibrance',
        'opalescence_strength', 'champleve_flow_alignment',
        'aether_scattering_strength', 'micro_contrast_strength',
        'edge_luminance_strength', 'atmospheric_depth_strength',
        'fine_texture_strength', 'hdr_scale', 'clip_black', 'clip_white'
    ]
    
    param_stats = {}
    for effect_name, params in sorted(effect_params.items()):
        for param_name, values in sorted(params.items()):
            # Only process numeric values
            if values and isinstance(values[0], (int, float)):
                full_name = f"{effect_name}.{param_name}"
                param_stats[full_name] = {
                    'values': values,
                    'stats': compute_statistics(values)
                }
    
    # Print statistics for important parameters
    for param in important_params:
        # Find matching parameter (partial match)
        matches = [k for k in param_stats.keys() if param in k]
        if matches:
            key = matches[0]
            stats = param_stats[key]['stats']
            values = param_stats[key]['values']
            
            print(f"\n   {key:45s}")
            print(f"      Range:  [{stats['min']:7.4f}, {stats['max']:7.4f}]")
            print(f"      Mean:    {stats['mean']:7.4f}  ±  {stats['stdev']:7.4f}")
            print(f"      Median:  {stats['median']:7.4f}")
            print(f"      Q1-Q3:  [{stats['q1']:7.4f}, {stats['q3']:7.4f}]  (central 50%)")
    
    # Analyze gradient palettes
    print_section("GRADIENT PALETTE DISTRIBUTION")
    palette_names = [
        "GoldPurple", "CosmicTealPink", "AmberCyan", "IndigoGold", "BlueOrange",
        "VenetianRenaissance", "JapaneseUkiyoe", "ArtNouveau", "LunarOpal", "FireOpal",
        "DeepOcean", "AuroraBorealis", "MoltenMetal", "AncientJade", "RoyalAmethyst"
    ]
    
    gradient_values = []
    for effect_name, params in effect_params.items():
        if 'gradient_map_palette' in params:
            gradient_values = [int(v) for v in params['gradient_map_palette']]
            break
    
    if gradient_values:
        palette_counts = Counter(gradient_values)
        for palette_id, count in sorted(palette_counts.items(), key=lambda x: -x[1]):
            if palette_id < len(palette_names):
                palette_name = palette_names[palette_id]
                print(f"   {palette_id:2d}. {palette_name:25s}: {count:2d} times ({count/len(gradient_values)*100:5.1f}%)")
    
    # Analyze drift configuration
    print_section("DRIFT CONFIGURATION")
    drift_data = analyze_drift(favorites)
    
    if drift_data:
        print(f"\n   Mode distribution:")
        mode_counts = Counter(drift_data.get('mode', []))
        for mode, count in mode_counts.most_common():
            print(f"      {mode:15s}: {count:2d} times")
        
        print(f"\n   Drift Scale:")
        if drift_data.get('scale'):
            stats = compute_statistics(drift_data['scale'])
            print(f"      Range:  [{stats['min']:.4f}, {stats['max']:.4f}]")
            print(f"      Mean:   {stats['mean']:.4f} ± {stats['stdev']:.4f}")
            print(f"      Median: {stats['median']:.4f}")
        
        print(f"\n   Arc Fraction:")
        if drift_data.get('arc_fraction'):
            stats = compute_statistics(drift_data['arc_fraction'])
            print(f"      Range:  [{stats['min']:.4f}, {stats['max']:.4f}]")
            print(f"      Mean:   {stats['mean']:.4f} ± {stats['stdev']:.4f}")
            print(f"      Median: {stats['median']:.4f}")
        
        print(f"\n   Orbit Eccentricity:")
        if drift_data.get('orbit_eccentricity'):
            stats = compute_statistics(drift_data['orbit_eccentricity'])
            print(f"      Range:  [{stats['min']:.4f}, {stats['max']:.4f}]")
            print(f"      Mean:   {stats['mean']:.4f} ± {stats['stdev']:.4f}")
            print(f"      Median: {stats['median']:.4f}")
    
    # Analyze simulation parameters
    print_section("SIMULATION PARAMETERS")
    sim_data = analyze_simulation(favorites)
    
    for param_name, values in sorted(sim_data.items()):
        if values and isinstance(values[0], (int, float)):
            stats = compute_statistics(values)
            print(f"\n   {param_name:25s}")
            print(f"      Range:  [{stats['min']:.1f}, {stats['max']:.1f}]")
            print(f"      Mean:   {stats['mean']:.1f} ± {stats['stdev']:.1f}")
    
    # Generate recommendations
    print_section("RECOMMENDATIONS FOR GENERATING SIMILAR IMAGES")
    
    print("""
   Based on the analysis of your favorite images, here are parameter recommendations:
   
   1. MODE PREFERENCE:
   """)
    if special_count > standard_count * 1.5:
        print(f"      → Use --special flag MORE often ({special_count/total*100:.0f}% of favorites)")
    elif standard_count > special_count * 1.5:
        print(f"      → Use STANDARD mode MORE often ({standard_count/total*100:.0f}% of favorites)")
    else:
        print(f"      → Current mix is good ({special_count}/{standard_count} special/standard)")
    
    print(f"\n   2. EFFECT PREFERENCES:")
    print(f"      Effects to ENABLE more often (>70% enabled in favorites):")
    for effect, enabled_list in sorted(effect_enabled.items()):
        enable_rate = sum(enabled_list) / len(enabled_list)
        if enable_rate > 0.7:
            print(f"         → {effect:25s} ({enable_rate*100:.0f}% enabled)")
    
    print(f"\n      Effects to DISABLE more often (<30% enabled in favorites):")
    for effect, enabled_list in sorted(effect_enabled.items()):
        enable_rate = sum(enabled_list) / len(enabled_list)
        if enable_rate < 0.3:
            print(f"         → {effect:25s} ({enable_rate*100:.0f}% enabled) [consider --disable-{effect}]")
    
    print(f"\n   3. KEY PARAMETER RANGES (use central 50% for tighter results):")
    
    key_recommendations = [
        ('chromatic_bloom_strength', 'param_chromatic_bloom_strength'),
        ('glow_strength', 'param_glow_strength'),
        ('perceptual_blur_strength', 'param_perceptual_blur_strength'),
        ('gradient_map_strength', 'param_gradient_map_strength'),
        ('hdr_scale', 'param_hdr_scale'),
        ('vignette_strength', 'param_vignette_strength'),
    ]
    
    for search_key, cli_param in key_recommendations:
        matches = [k for k in param_stats.keys() if search_key in k]
        if matches:
            stats = param_stats[matches[0]]['stats']
            print(f"      --{cli_param} {stats['q1']:.4f}  to  {stats['q3']:.4f}")
            print(f"          (median: {stats['median']:.4f}, avoid extremes)")
    
    print(f"\n   4. GRADIENT PALETTE SUGGESTIONS:")
    if gradient_values:
        palette_counts = Counter(gradient_values)
        top_palettes = palette_counts.most_common(5)
        print(f"      Most successful palettes (use these more often):")
        for palette_id, count in top_palettes:
            if palette_id < len(palette_names):
                print(f"         → {palette_id:2d}. {palette_names[palette_id]:25s} ({count} times)")
    
    print(f"\n   5. DRIFT CONFIGURATION:")
    if drift_data:
        if drift_data.get('scale'):
            stats = compute_statistics(drift_data['scale'])
            print(f"      --drift-scale {stats['q1']:.4f}  to  {stats['q3']:.4f}  (median: {stats['median']:.4f})")
        if drift_data.get('arc_fraction'):
            stats = compute_statistics(drift_data['arc_fraction'])
            print(f"      --drift-arc-fraction {stats['q1']:.4f}  to  {stats['q3']:.4f}  (median: {stats['median']:.4f})")
        if drift_data.get('orbit_eccentricity'):
            stats = compute_statistics(drift_data['orbit_eccentricity'])
            print(f"      --drift-orbit-eccentricity {stats['q1']:.4f}  to  {stats['q3']:.4f}  (median: {stats['median']:.4f})")
    
    print("\n" + "="*80)
    print("  ANALYSIS COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()

