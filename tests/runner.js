/* Mini test runner sin dependencias. Resultado en pantalla y en document.title (PASS/FAIL). */
(function () {
  'use strict';

  const tests = [];
  const show = (value) => JSON.stringify(value);

  window.test = (name, fn) => tests.push({ name, fn });

  window.assert = {
    equal: (actual, expected, label = '') => {
      if (show(actual) !== show(expected)) {
        throw new Error(`${label} esperado ${show(expected)}, obtenido ${show(actual)}`);
      }
    },
    ok: (value, label = 'se esperaba verdadero') => {
      if (!value) throw new Error(label);
    },
  };

  const runOne = async ({ name, fn }) => {
    try {
      await fn();
      return { name, error: null };
    } catch (err) {
      return { name, error: err.message };
    }
  };

  const line = ({ name, error }) => (error ? `✗ ${name} → ${error}` : `✓ ${name}`);

  window.runTests = async () => {
    const results = [];
    for (const t of tests) results.push(await runOne(t)); // en serie: orden estable
    const failed = results.filter((r) => r.error).length;
    const verdict = failed ? `FAIL ${failed}/${results.length}` : `PASS ${results.length}/${results.length}`;
    document.title = verdict;
    document.getElementById('report').textContent = [verdict, '', ...results.map(line)].join('\n');
    document.body.className = failed ? 'fail' : 'pass';
  };
})();
