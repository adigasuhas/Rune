/**
 * Math-symbol palette for the notebook editor insert panel.
 * Extracted from NotebookView.tsx (static data).
 */

export interface MathSymbol { latex: string; display: string; }
export interface MathSymbolCategory { category: string; symbols: MathSymbol[]; }

export const MATH_SYMBOLS: MathSymbolCategory[] = [
  {
    category: 'Greek Letters',
    symbols: [
      { latex: '\\alpha', display: 'α' },
      { latex: '\\beta', display: 'β' },
      { latex: '\\gamma', display: 'γ' },
      { latex: '\\delta', display: 'δ' },
      { latex: '\\epsilon', display: 'ε' },
      { latex: '\\zeta', display: 'ζ' },
      { latex: '\\eta', display: 'η' },
      { latex: '\\theta', display: 'θ' },
      { latex: '\\iota', display: 'ι' },
      { latex: '\\kappa', display: 'κ' },
      { latex: '\\lambda', display: 'λ' },
      { latex: '\\mu', display: 'μ' },
      { latex: '\\nu', display: 'ν' },
      { latex: '\\xi', display: 'ξ' },
      { latex: '\\pi', display: 'π' },
      { latex: '\\rho', display: 'ρ' },
      { latex: '\\sigma', display: 'σ' },
      { latex: '\\tau', display: 'τ' },
      { latex: '\\upsilon', display: 'υ' },
      { latex: '\\phi', display: 'φ' },
      { latex: '\\chi', display: 'χ' },
      { latex: '\\psi', display: 'ψ' },
      { latex: '\\omega', display: 'ω' },
      { latex: '\\Delta', display: 'Δ' },
      { latex: '\\Theta', display: 'Θ' },
      { latex: '\\Lambda', display: 'Λ' },
      { latex: '\\Xi', display: 'Ξ' },
      { latex: '\\Pi', display: 'Π' },
      { latex: '\\Sigma', display: 'Σ' },
      { latex: '\\Phi', display: 'Φ' },
      { latex: '\\Psi', display: 'Ψ' },
      { latex: '\\Omega', display: 'Ω' },
    ]
  },
  {
    category: 'Operators and relations',
    symbols: [
      { latex: '\\pm', display: '±' },
      { latex: '\\mp', display: '∓' },
      { latex: '\\times', display: '×' },
      { latex: '\\div', display: '÷' },
      { latex: '\\neq', display: '≠' },
      { latex: '\\approx', display: '≈' },
      { latex: '\\equiv', display: '≡' },
      { latex: '\\le', display: '≤' },
      { latex: '\\ge', display: '≥' },
      { latex: '\\ll', display: '«' },
      { latex: '\\gg', display: '»' },
      { latex: '\\infty', display: '∞' },
      { latex: '\\propto', display: '∝' },
      { latex: '\\partial', display: '∂' },
      { latex: '\\nabla', display: '∇' },
      { latex: '\\cdot', display: '·' },
      { latex: '\\forall', display: '∀' },
      { latex: '\\exists', display: '∃' },
      { latex: '\\in', display: '∈' },
      { latex: '\\notin', display: '∉' },
      { latex: '\\subset', display: '⊂' },
      { latex: '\\supset', display: '⊃' },
      { latex: '\\cup', display: '∪' },
      { latex: '\\cap', display: '∩' },
    ]
  },
  {
    category: 'Calculus and advanced',
    symbols: [
      { latex: '\\sum_{i=1}^{n}', display: '∑' },
      { latex: '\\int_{a}^{b}', display: '∫' },
      { latex: '\\iint', display: '∬' },
      { latex: '\\iiint', display: '∭' },
      { latex: '\\oint', display: '∮' },
      { latex: '\\prod_{i=1}^{n}', display: '∏' },
      { latex: '\\lim_{x \\to \\infty}', display: 'lim' },
      { latex: '\\hbar', display: 'ℏ' },
    ]
  },
  {
    category: 'Arrows',
    symbols: [
      { latex: '\\to', display: '→' },
      { latex: '\\leftarrow', display: '←' },
      { latex: '\\uparrow', display: '↑' },
      { latex: '\\downarrow', display: '↓' },
      { latex: '\\Rightarrow', display: '⇒' },
      { latex: '\\Leftarrow', display: '⇐' },
      { latex: '\\Leftrightarrow', display: '⇔' },
      { latex: '\\leftrightarrow', display: '↔' },
      { latex: '\\Longleftrightarrow', display: '⟺' },
    ]
  },
  {
    category: 'Structures',
    symbols: [
      { latex: '\\frac{a}{b}', display: 'a/b' },
      { latex: '\\sqrt{x}', display: '√x' },
      { latex: '\\sqrt[n]{x}', display: 'n√x' },
      { latex: 'x^{n}', display: 'xⁿ' },
      { latex: 'x_{i}', display: 'xᵢ' },
      { latex: '\\vec{x}', display: 'x⃗' },
      { latex: '\\bar{x}', display: 'x̄' },
      { latex: '\\hat{y}', display: 'ŷ' },
      { latex: '\\dot{z}', display: 'ż' },
      { latex: '\\ddot{w}', display: 'ẅ' },
    ]
  }
];
