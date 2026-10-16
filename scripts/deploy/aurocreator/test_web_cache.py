import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class WebCacheInputsTests(unittest.TestCase):
    def test_generated_files_do_not_poison_hash_but_shared_sources_invalidate_it(self):
        # Exercise the actual Turbo binary in a source-only (no .git) workspace,
        # which is how the production build host receives the monorepo.
        turbo = ROOT / 'node_modules/.bin/turbo'
        self.assertTrue(turbo.is_file(), 'install workspace dependencies before deployment checks')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = json.loads('\n'.join(line for line in (ROOT / 'turbo.json').read_text().splitlines()
                                          if not line.lstrip().startswith('//')))
            (root / 'turbo.json').write_text(json.dumps(config))
            (root / 'package.json').write_text(json.dumps({'name': 'cache-input-test', 'private': True,
                                                         'packageManager': json.loads((ROOT / 'package.json').read_text())['packageManager']}))
            (root / 'pnpm-workspace.yaml').write_text('packages:\n  - apps/*\n  - packages/*\n')
            (root / 'pnpm-lock.yaml').write_text("lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web:\n    dependencies:\n      '@fixture/core':\n        specifier: workspace:*\n        version: link:../../packages/core\n  packages/core: {}\n")
            (root / '.github/workflows').mkdir(parents=True)
            (root / '.github/workflows/ci.yml').write_text('name: fixture\n')
            for directory, package in [('apps/web', {'name': '@fixture/web', 'version': '1.0.0', 'scripts': {'build': 'echo fixture'}, 'dependencies': {'@fixture/core': 'workspace:*'}}),
                                       ('packages/core', {'name': '@fixture/core', 'version': '1.0.0'})]:
                path = root / directory
                path.mkdir(parents=True)
                (path / 'package.json').write_text(json.dumps(package))
                (path / 'source.ts').write_text('export const value = 1\n')
            generated_paths = ['apps/web/.next/cache/webpack/pack', 'apps/web/.next/standalone/server.js',
                               'apps/web/.next-performance-check/cache/pack', 'apps/web/next-env.d.ts',
                               'apps/web/.turbo/turbo-build.log', 'apps/web/node_modules/.bin/next',
                               'packages/core/node_modules/.bin/tsc', 'packages/core/typecheck.tsbuildinfo']
            for name in generated_paths:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('first generated value\n')

            def task():
                result = subprocess.run([str(turbo), 'build', '--filter=@fixture/web', '--dry=json'],
                                        cwd=root, env=dict(os.environ, TURBO_TELEMETRY_DISABLED='1'),
                                        capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                tasks = json.loads(result.stdout)['tasks']
                for item in tasks:
                    self.assertFalse(any('.next/' in name or '.next-performance-' in name or 'node_modules/' in name or '.turbo/' in name
                                         for name in item.get('inputs', {})), item.get('inputs'))
                return next(item for item in tasks if item['taskId'] == '@fixture/web#build')

            before = task()['hash']
            for name in generated_paths:
                (root / name).write_text('different generated value\n')
            self.assertEqual(task()['hash'], before)
            (root / 'packages/core/source.ts').write_text('export const value = 2\n')
            shared_changed = task()['hash']
            self.assertNotEqual(shared_changed, before)
            (root / 'apps/web/source.ts').write_text('export const value = 3\n')
            self.assertNotEqual(task()['hash'], shared_changed)


if __name__ == '__main__':
    unittest.main()
