import json,sys
B=sys.argv[1]; out_path=sys.argv[2]
d=json.load(open(B+'/practice_v2.json')); s3=json.load(open(B+'/strang_practice.json')); s5=json.load(open(B+'/thomas_practice.json'))
pat=dict(d['pat']); pat.update(s3['pat']); pat.update(s5['pat'])
rows=lambda qs: ",\n".join('      '+json.dumps(q,ensure_ascii=False,separators=(',',':')) for q in qs)
books=[
 dict(id="ross", dotted=True, title="Sheldon Ross — A First Course in Probability (10th ed)", short="Ross · First Course in Probability", subj="ps",
      chapters={1:"Combinatorial Analysis",2:"Axioms of Probability",3:"Conditional Probability and Independence",4:"Random Variables",5:"Continuous Random Variables",6:"Jointly Distributed Random Variables",7:"Properties of Expectation",8:"Limit Theorems",9:"Additional Topics (9.3 Entropy)"},
      notes="Only GATE-relevant exercises are listed. Chapter 10 (Simulation) is skipped. Self-Test solutions are at the back of the book (page shown).", q=d['q1']),
 dict(id="rossips", title="Sheldon Ross — Introduction to Probability and Statistics for Engineers and Scientists (5th ed)", short="Ross · Prob & Stats for Engineers", subj="ps",
      chapters={2:"Descriptive Statistics",3:"Elements of Probability",4:"Random Variables and Expectation",5:"Special Random Variables",6:"Distributions of Sampling Statistics",7:"Parameter Estimation",8:"Hypothesis Testing",9:"Regression",11:"Goodness of Fit and Categorical Data"},
      notes="Only GATE-relevant problems are listed. Skipped: Ch 1, 10 (ANOVA), 12–15 (nonparametric, quality control, reliability, simulation). Answers are in the Instructor's Manual at the start of your PDF (page shown).", q=d['q2']),
 dict(id="strang", sets=True, title="Gilbert Strang — Introduction to Linear Algebra (5th ed)", short="Strang · Linear Algebra", subj="la",
      chapters={1:"Introduction to Vectors",2:"Solving Linear Equations",3:"Vector Spaces and Subspaces",4:"Orthogonality",5:"Determinants",6:"Eigenvalues and Eigenvectors",7:"SVD and PCA",12:"Linear Algebra in Probability & Statistics"},
      notes="Only GATE-relevant problems are listed. Skipped: 6.3 (differential equations), Ch 8–11 (linear transformations, complex matrices, applications, numerical methods), 12.3. This PDF has no answer section; check with the Worked Examples in each section or the MIT 18.06 solutions.", q=s3['q']),
 dict(id="thomas", sets=True, setWord="Exercises", title="Thomas' Calculus: Early Transcendentals (13th ed)", short="Thomas · Calculus", subj="co",
      chapters={1:"Functions",2:"Limits and Continuity",3:"Derivatives",4:"Applications of Derivatives",5:"Integrals",8:"Techniques of Integration (parts, improper, probability)",10:"Sequences and Series (Taylor series)"},
      notes="Only GATE-relevant exercises are listed. In long drill groups (plain derivative/integral calculations) only every fourth exercise is listed; concept groups are complete. Answers to odd-numbered exercises are at the back of the book (page shown). Skipped: Ch 6, 7, 9, 11–16.", q=s5['q']),
]
js="""/* Practice question bank: GATE-relevant exercises only, as references (chapter/section, number, PDF page) plus tags.
   Question text stays in the book; open your own PDF at the page shown.
   Fields: c chapter, sec problem-set section (Strang), s section (P = Problems, TE = Theoretical Exercises, ST = Self-Test),
   n number, p PDF page (page number in your PDF viewer), l level (E/M/H), g GATE rating
   (3 GATE-likely, 2 good practice), k pattern, t short label (our words),
   x starred as harder in the book, a PDF page of the answer, o PDF page of the full solution. */
const PRACTICE_PATTERNS = """+json.dumps(pat,ensure_ascii=False)+""";
const PRACTICE_BOOKS = [
"""+",\n".join("  {\n"+"".join(f"    {k}: {json.dumps(v,ensure_ascii=False)},\n" for k,v in b.items() if k!='q')+"    q: [\n"+rows(b['q'])+"\n    ]\n  }" for b in books)+"""
];
PRACTICE_BOOKS.forEach(b => { b.patterns = PRACTICE_PATTERNS; });
"""
open(out_path,'w').write(js)
P=json.load(open(B+'/pyq_final.json'))
old=open(out_path.replace('practice.js','pyq.js')).read()
head=old.split('  q: [')[0]
open(out_path.replace('practice.js','pyq.js'),'w').write(head+'  q: [\n'+",\n".join('    '+json.dumps(q,ensure_ascii=False,separators=(',',':')) for q in P)+'\n  ]\n};\n')
print('ok', [ (b['id'],len(b['q'])) for b in books])
