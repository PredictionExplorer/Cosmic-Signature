#!/usr/bin/env python3
"""
Improved Certora test runner that properly detects all types of failures
including SANITY_FAIL, violations, and errors.
"""

import subprocess
import json
import time
import re
import os
import sys

def parse_certora_output(output):
    """Parse Certora output to extract detailed results"""
    results = {
        'rules': {},
        'has_violations': False,
        'has_sanity_fails': False,
        'has_errors': False,
        'total_rules': 0,
        'passed_rules': 0,
        'failed_rules': 0,
        'sanity_failed_rules': 0
    }
    
    # Look for the output.json file path
    output_json_match = re.search(r'Reports in .*/emv-\d+-certora-[^/]+/Reports', output)
    if output_json_match:
        report_dir = output_json_match.group(0).replace('Reports in ', '')
        output_json_path = os.path.join(report_dir, 'output.json')
        
        # Try to read the output.json file
        if os.path.exists(output_json_path):
            try:
                with open(output_json_path, 'r') as f:
                    json_data = json.load(f)
                    if 'rules' in json_data:
                        for rule, status in json_data['rules'].items():
                            results['total_rules'] += 1
                            results['rules'][rule] = status
                            
                            if status == 'SUCCESS':
                                results['passed_rules'] += 1
                            elif status == 'SANITY_FAIL':
                                results['sanity_failed_rules'] += 1
                                results['has_sanity_fails'] = True
                            elif status == 'VIOLATED':
                                results['failed_rules'] += 1
                                results['has_violations'] = True
                            else:
                                # Handle nested results (like envfreeFuncsStaticCheck)
                                if isinstance(status, dict):
                                    # Count sub-rules
                                    for sub_status in status.values():
                                        if isinstance(sub_status, list):
                                            results['passed_rules'] += len(sub_status)
                                        else:
                                            results['passed_rules'] += 1
                                else:
                                    results['failed_rules'] += 1
                                    results['has_errors'] = True
                    return results
            except:
                pass
    
    # Fallback to parsing text output if JSON not available
    for line in output.split('\n'):
        if 'Result for' in line and ': SANITY_FAIL' in line:
            results['has_sanity_fails'] = True
            rule_name = line.split('Result for ')[1].split(':')[0]
            results['rules'][rule_name] = 'SANITY_FAIL'
            results['sanity_failed_rules'] += 1
            
        elif 'Verified:' in line and 'rule_not_vacuous' not in line:
            rule_name = line.split('Verified: ')[1].strip()
            if rule_name not in results['rules']:
                results['rules'][rule_name] = 'SUCCESS'
                results['passed_rules'] += 1
                
        elif 'Violated:' in line and 'rule_not_vacuous' not in line:
            results['has_violations'] = True
            rule_name = line.split('Violated: ')[1].strip()
            results['rules'][rule_name] = 'VIOLATED'
            results['failed_rules'] += 1
            
        elif 'ERROR: Execution of command' in line and 'terminated with exitcode' in line:
            results['has_errors'] = True
    
    results['total_rules'] = len(results['rules'])
    return results

def run_test(conf_file, test_name):
    """Run a single Certora test and return detailed results"""
    print(f"\n{'='*80}")
    print(f"Running {test_name} ({conf_file})...")
    print(f"{'='*80}")
    
    start_time = time.time()
    
    try:
        # Run the certora test
        cmd = ['certoraRun.py', conf_file, '--solc', 'solc8.29']
        print(f"Command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1200  # 20 minute timeout
        )
        
        elapsed_time = time.time() - start_time
        output = result.stdout + result.stderr
        
        # Parse the output
        parsed = parse_certora_output(output)
        
        # Determine overall status
        if parsed['has_violations'] or parsed['has_errors']:
            overall_status = 'FAILED'
        elif parsed['has_sanity_fails']:
            overall_status = 'SANITY_FAIL'
        elif parsed['total_rules'] > 0:
            # If we have no violations, sanity fails, or errors, it's a success
            overall_status = 'SUCCESS'
        else:
            overall_status = 'UNKNOWN'
        
        return {
            'name': test_name,
            'conf_file': conf_file,
            'status': overall_status,
            'time': elapsed_time,
            'exit_code': result.returncode,
            'details': parsed,
            'command': ' '.join(cmd)
        }
        
    except subprocess.TimeoutExpired:
        return {
            'name': test_name,
            'conf_file': conf_file,
            'status': 'TIMEOUT',
            'time': 1200,
            'exit_code': -1,
            'details': {'has_errors': True, 'rules': {}, 'total_rules': 0}
        }
    except Exception as e:
        return {
            'name': test_name,
            'conf_file': conf_file,
            'status': 'ERROR',
            'time': 0,
            'exit_code': -1,
            'details': {'has_errors': True, 'rules': {}, 'total_rules': 0},
            'error': str(e)
        }

def print_test_result(result):
    """Print formatted test result"""
    status_emoji = {
        'SUCCESS': '✅',
        'FAILED': '❌',
        'SANITY_FAIL': '⚠️',
        'TIMEOUT': '⏱️',
        'ERROR': '💥',
        'UNKNOWN': '❓'
    }
    
    emoji = status_emoji.get(result['status'], '❓')
    print(f"\n{emoji} {result['name']}: {result['status']} (Time: {result['time']:.1f}s)")
    
    if result['details']['total_rules'] > 0:
        print(f"   Rules: {result['details']['passed_rules']}/{result['details']['total_rules']} passed")
        if result['details']['sanity_failed_rules'] > 0:
            print(f"   Sanity Failures: {result['details']['sanity_failed_rules']}")
        if result['details']['failed_rules'] > 0:
            print(f"   Violations: {result['details']['failed_rules']}")
        
        # Show individual rule results
        if result['details']['rules']:
            print("   Rule Results:")
            for rule, status in result['details']['rules'].items():
                if isinstance(status, str):
                    rule_emoji = '✅' if status == 'SUCCESS' else '❌' if status == 'VIOLATED' else '⚠️'
                    print(f"     {rule_emoji} {rule}: {status}")

def main():
    """Run all Certora tests with proper error detection"""
    
    # Change to project directory if needed
    if os.path.exists('.certora-venv'):
        # We're in the project root
        pass
    else:
        print("Error: Not in project root directory")
        return 1
    
    # List of test configurations
    tests = [
        ('certora/SystemConfig.conf', 'SystemConfig'),
        ('certora/GameOwnership.conf', 'GameOwnership'),
        ('certora/PrizesWalletSafety_simple.conf', 'PrizesWalletSafety'),
        ('certora/WalletsAndETH.conf', 'WalletsAndETH'),
        ('certora/TokensAndNFTs_simple.conf', 'TokensAndNFTs'),
        ('certora/StakingWallets.conf', 'StakingWallets'),
        ('certora/GameCore.conf', 'GameCore'),
        ('certora/CharityWallet.conf', 'CharityWallet'),
        ('certora/MarketingWallet.conf', 'MarketingWallet')
    ]
    
    results = []
    
    print("CERTORA TEST SUITE - COMPREHENSIVE RUN")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total tests to run: {len(tests)}")
    
    # Activate virtual environment
    activate_cmd = 'source .certora-venv/bin/activate'
    print(f"\nNote: Make sure to run '{activate_cmd}' before running this script")
    
    # Run each test
    for conf_file, test_name in tests:
        result = run_test(conf_file, test_name)
        results.append(result)
        print_test_result(result)
    
    # Generate summary
    print("\n" + "="*80)
    print("FINAL RESULTS SUMMARY")
    print("="*80)
    
    success_count = sum(1 for r in results if r['status'] == 'SUCCESS')
    failed_count = sum(1 for r in results if r['status'] == 'FAILED')
    sanity_fail_count = sum(1 for r in results if r['status'] == 'SANITY_FAIL')
    other_count = len(results) - success_count - failed_count - sanity_fail_count
    
    print(f"\nTotal Tests: {len(results)}")
    print(f"✅ Fully Passed: {success_count}")
    print(f"⚠️  Sanity Failed: {sanity_fail_count}")
    print(f"❌ Failed: {failed_count}")
    if other_count > 0:
        print(f"❓ Other: {other_count}")
    
    total_rules = sum(r['details']['total_rules'] for r in results)
    total_passed = sum(r['details']['passed_rules'] for r in results)
    total_sanity_failed = sum(r['details']['sanity_failed_rules'] for r in results)
    total_failed = sum(r['details']['failed_rules'] for r in results)
    
    print(f"\nTotal Rules Checked: {total_rules}")
    print(f"✅ Rules Passed: {total_passed}")
    print(f"⚠️  Rules with Sanity Failures: {total_sanity_failed}")
    print(f"❌ Rules Failed: {total_failed}")
    
    # Write detailed results to file
    with open('certora_test_results.md', 'w') as f:
        f.write("# Certora Formal Verification - Comprehensive Test Results\n\n")
        f.write(f"**Date**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("## Summary\n\n")
        f.write(f"- **Total Test Suites**: {len(results)}\n")
        f.write(f"- **✅ Fully Passed**: {success_count}\n")
        f.write(f"- **⚠️ Sanity Failed**: {sanity_fail_count}\n")
        f.write(f"- **❌ Failed**: {failed_count}\n")
        f.write(f"- **Total Rules**: {total_rules}\n")
        f.write(f"- **Rules Passed**: {total_passed}\n")
        f.write(f"- **Rules with Sanity Failures**: {total_sanity_failed}\n")
        f.write(f"- **Rules Failed**: {total_failed}\n\n")
        
        f.write("## Detailed Results\n\n")
        for r in results:
            status_emoji = {
                'SUCCESS': '✅',
                'FAILED': '❌',
                'SANITY_FAIL': '⚠️',
                'TIMEOUT': '⏱️',
                'ERROR': '💥',
                'UNKNOWN': '❓'
            }.get(r['status'], '❓')
            
            f.write(f"### {status_emoji} {r['name']}\n\n")
            f.write(f"- **Status**: {r['status']}\n")
            f.write(f"- **Time**: {r['time']:.1f} seconds\n")
            f.write(f"- **Exit Code**: {r['exit_code']}\n")
            f.write(f"- **Config**: `{r['conf_file']}`\n")
            
            if r['details']['total_rules'] > 0:
                f.write(f"- **Rules**: {r['details']['passed_rules']}/{r['details']['total_rules']} passed\n")
                if r['details']['sanity_failed_rules'] > 0:
                    f.write(f"- **Sanity Failures**: {r['details']['sanity_failed_rules']}\n")
                if r['details']['failed_rules'] > 0:
                    f.write(f"- **Violations**: {r['details']['failed_rules']}\n")
                
                if r['details']['rules']:
                    f.write("\n**Individual Rule Results:**\n\n")
                    for rule, status in r['details']['rules'].items():
                        if isinstance(status, str):
                            rule_emoji = '✅' if status == 'SUCCESS' else '❌' if status == 'VIOLATED' else '⚠️'
                            f.write(f"- {rule_emoji} `{rule}`: {status}\n")
            
            if 'error' in r:
                f.write(f"\n**Error**: {r['error']}\n")
            
            f.write("\n")
    
    print(f"\nDetailed results written to: certora_test_results.md")
    
    # Return appropriate exit code
    if success_count == len(results):
        return 0  # All tests fully passed
    elif failed_count > 0:
        return 2  # Some tests had actual failures
    else:
        return 1  # Some tests had sanity failures

if __name__ == "__main__":
    sys.exit(main()) 