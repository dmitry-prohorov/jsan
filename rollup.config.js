import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'

export default [
    {
      input: 'lib/index.js',
      output: [
        {
          file: 'dist/jsan.es.js',
          format: 'es',
        },
        {
          file: 'dist/jsan.umd.js',
          format: 'umd',
          name: 'jsan'
        },
        {
          file: 'dist/jsan.cjs.js',
          format: 'cjs',
          exports: 'auto'
        }
      ],
      plugins: [
        commonjs(),
        nodeResolve({
          jsnext: true
        }),
        babel({
          exclude: 'node_modules/**',
          babelHelpers: 'runtime',
          plugins: [
            [
              '@babel/plugin-transform-runtime',
              {
                useESModules: true,
              },
            ],
          ].filter(Boolean),
        })
      ]
    }
  ];