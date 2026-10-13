export interface NotebookTemplate {
  name: string;
  category: string;
  title: string;
  content: string;
}

export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    name: 'Research Paper / Note',
    category: 'Research',
    title: 'New Research Note',
    content: `\\section{Abstract}
This note details our recent findings on the superconductivity properties of local compounds.

\\section{Methodology}
We performed several resistivity measurements under high pressures.
\\begin{itemize}
  \\item Sample Preparation: Chemical vapor deposition.
  \\item Measurement Temp: 1.5 K to 300 K.
\\end{itemize}

\\section{Results}
Our primary observation is the superconducting transition temperature.
\\begin{equation}
  T_c = \\omega_D \\exp\\left(-\\frac{1}{\\lambda}\\right)
  \\label{eq:tc}
\\end{equation}
As shown in Equation \\ref{eq:tc}, the temperature is exponentially dependent on the coupling constant.

\\section{Discussion}
Further investigations are planned to explore the mechanism. \\cite{BCS1957}

\\printbibliography`
  },
  {
    name: 'Literature Review',
    category: 'Literature Notes',
    title: 'Paper Summary: [Title]',
    content: `\\section{Citation Information}
\\begin{description}
  \\item[Key] BCS1957
  \\item[Authors] Bardeen, J., Cooper, L. N., and Schrieffer, J. R.
  \\item[Title] Theory of Superconductivity
  \\item[Journal] Physical Review, Vol 108, pp. 1175--1204, 1957.
\\end{description}

\\section{Key Contributions}
The paper provides a microscopic theory of superconductivity, explaining:
\\begin{enumerate}
  \\item The electron-phonon coupling mechanism.
  \\item The Josephson effect and flux quantization basis.
  \\item The energy gap at zero temperature.
\\end{enumerate}

\\section{Critical Analysis}
This theory forms the foundational framework (BCS Theory) for conventional superconductivity.

\\section{Relevance to Project}
Essential theoretical model for validating our numerical simulation results.`
  },
  {
    name: 'Meeting Notes Log',
    category: 'Meeting Notes',
    title: 'Meeting Notes: [Date]',
    content: `\\section{Meeting Overview}
\\begin{description}
  \\item[Date] \\textrm{June 13, 2026}
  \\item[Attendees] Dr. John Doe, Suhas, Alice
  \\item[Topic] Project Rune Technical Discussion
\\end{description}

\\section{Agenda}
\\begin{itemize}
  \\item Review simulator numerical results.
  \\item LaTeX document system integration status.
  \\item Task priority updates.
\\end{itemize}

\\section{Discussion Summary}
Alice reported that the simulator was generating anomalous figures. We need to check parameters.
Suhas presented the new LaTeX parser, which will be integrated this week.

\\section{Action Items}
\\begin{enumerate}
  \\item Check simulation parameters (Alice).
  \\item Integrate split-view LaTeX editor (Suhas).
  \\item Setup PostgreSQL test suite (Alice).
\\end{enumerate}`
  },
  {
    name: 'Experimental Record',
    category: 'Results',
    title: 'Experiment Log: [Name]',
    content: `\\section{Hypothesis}
We hypothesize that increasing the compound concentration will increase $T_c$.

\\section{Experimental Setup}
\\begin{itemize}
  \\item Instrument: Physical Property Measurement System (PPMS).
  \\item Material: LaFeAsO under doping.
\\end{itemize}

\\section{Observations}
\\begin{figure}
  \\includegraphics{/uploads/experimental_sample.png}
  \\caption{Micrograph of the prepared experimental sample.}
  \\label{fig:sample}
\\end{figure}

As shown in Figure \\ref{fig:sample}, the sample displays uniform microstructures.
Resistivity dropped sharply to zero at 26 K.

\\section{Conclusion}
The experiment confirmed the high-temperature transition but fell short of the predicted 35 K limit.`
  },
  {
    name: 'Simulation Run Log',
    category: 'Results',
    title: 'Simulation: [Model Name]',
    content: `\\section{Parameters}
\\begin{table}
  \\caption{Simulation configurations for Grid-A}
  \\label{tab:params}
  \\begin{tabular}{c & c}
    Parameter & Value \\\\
    \\hline
    Grid Size & $100 \\times 100 \\times 100$ \\\\
    Time Step & $10^{-6}$ s \\\\
    Tolerance & $10^{-9}$
  \\end{tabular}
\\end{table}

We initialized the model with parameters detailed in Table \\ref{tab:params}.

\\section{Execution Logs}
The simulation completed in 4.5 hours with zero divergence warnings.

\\section{Numerical Analysis}
The relaxation phase exhibits a steady decline.
\\begin{align}
  E(t) &= E_0 e^{-\\alpha t} \\\\
  \\alpha &= 1.45 \\times 10^3 \\text{ s}^{-1}
\\end{align}`
  },
  {
    name: 'Thesis Chapter Outline',
    category: 'Ideas',
    title: 'Chapter Outline: [Topic]',
    content: `\\section{Chapter 1: Introduction}
Background on superconductivity and previous modeling systems.

\\section{Chapter 2: Literature Review}
Overview of conventional and high-temperature theories.

\\section{Chapter 3: Numerical Methodology}
Detailed explanation of finite element analysis on superconductor equations.

\\section{Chapter 4: Results and Verification}
Comparison between simulated fields and experimental results.

\\section{Chapter 5: Conclusion & Future Outlook}
Summary of contributions and recommendations for future works.

\\section{Bibliography}
\\printbibliography`
  }
];
