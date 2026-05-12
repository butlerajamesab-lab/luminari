# Atlas-Prism Mathematical Foundation

Date: 2026-05-12

## Mathematical Framework for Atlas Data Ingestion and Prism Case Analysis

This document belongs to the Atlas-Prism boundary, not to every Luminari substrate. Atlas uses these primitives to normalize and relate ingested signals; Prism uses them to validate, correlate, score, and structure case-analysis outputs. Lighthouse may read the resulting governed signals, but Lighthouse is not the owner of this mathematical substrate.

The key abstraction is structural signal handling. Once Atlas maps observations into the universal signal representation, Atlas and Prism can share deterministic equations for convergence detection, similarity, geographic normalization, graph linking, and prioritization. Semantics still matter at the substrate boundary: Atlas owns ingestion/reference structure, Prism owns validation/refraction/escalation analysis, and Lighthouse/Luminari should treat this document as an external integration contract.

---

## 1. Core Mathematical Primitives

### Universal Signal Representation

Every signal maps to a standard feature vector:

```txt
Signal = {
  temporal_coordinate: t in R,
  spatial_coordinate: (x, y) in R^2 or G in Geography or n in Network,
  signal_type: tau in Categories,
  confidence: c in [0, 1],
  characteristics: {k1: v1, k2: v2, ...} in JSONB
}
```

The domain-agnostic property is that the engine operates on this structure without needing semantic interpretation of `signal_type`.

---

## 2. Signal Fingerprinting and Similarity

### Deterministic Fingerprint

```txt
h(s) = SHA256(tau || G || floor(t / Delta_t) || chi)
```

Where:

- `tau` is signal type
- `G` is geography or network identifier
- `t` is timestamp
- `Delta_t` is the temporal bucket size
- `chi` is the characteristics vector

The fingerprint is deterministic: same normalized signal input produces the same 64-character hex hash.

### Jaccard Similarity

```txt
J(A, B) = |A intersect B| / |A union B|
```

Where `A` and `B` are characteristic key sets. `J = 0` means no overlap; `J = 1` means identical key structure.

### Feature Vector Similarity

For numeric characteristic vectors:

```txt
cos(theta) = (a dot b) / (||a|| ||b||)
```

---

## 3. Precedence Confidence Scoring

The Atlas-Prism boundary uses a Bayesian-inspired weighted confidence score, not full Bayesian inference.

For true Beta-Binomial updating, use:

```txt
theta | C, N ~ Beta(alpha + C, beta + N)
```

The Atlas-Prism heuristic is a bounded directional confidence adjustment.

### Neutral Prior

```txt
P0 = 0.5
```

### Update Rule

```txt
Score_n = P0 * (1 + (C - N) * lambda_n)
```

Where:

- `C` is historical confirmations
- `N` is historical negations
- `lambda_n` is adaptive learning rate

### Adaptive Learning Rate

```txt
lambda_n = 1 / sqrt(C + N + 1)
```

### Bounded Score

```txt
Score = max(0, min(1, Score_n))
```

This is a bounded confidence score, not a formal posterior probability.

### Weighted Confidence

```txt
W = 0.7c + 0.3Score
```

Where `c` is raw signal confidence and `Score` is learned precedence confidence.

---

## 4. Geographic Normalization

### Area-Weighted Allocation

```txt
w(s -> t) = A(s intersect t) / A(s)
```

Where:

- `s` is source geography
- `t` is target geography
- `A(.)` is area measure

PostGIS finite-precision polygons require explicit normalization:

```txt
w_normalized(s -> t) = w_raw(s -> t) / sum_t w_raw(s -> t)
```

This guarantees conservation despite boundary precision effects.

### Signal Translation

```txt
c'_t = c_s * w(s -> t)
```

### Partition of Unity

```txt
sum_t w(s -> t) = 1
```

Validation tolerance:

```txt
|sum w - 1.0| <= 1e-6
```

### Pushforward Measure

```txt
(f_*mu)(B) = mu(f^-1(B))
```

---

## 5. Convergence Detection

### Distinct Signal Count

```txt
C1 = |{tau : tau in signals_at_geography_g}|
```

### Multiplicative Convergence Score

```txt
C2 = |T| * c_bar * ln(n + 1) * (0.5 + 0.5r)
```

Where:

- `T` is the set of distinct signal types
- `c_bar` is mean confidence
- `n` is total signal count
- `r` is recency factor in `[0, 1]`

### Recency Factor

```txt
r = 1 - (t_now - t_max) / Delta_t_window
```

### Poisson Z-Score

```txt
E[n] = (N_total / A_total) * A_geography
sigma = sqrt(E[n])
Z = (n_observed - E[n]) / sigma
```

The null hypothesis is that signals are distributed uniformly across geography proportional to area.

Interpretation:

- `Z > 2`: statistically significant convergence
- `Z > 3`: highly significant convergence

### Spatial Scan Statistic

```txt
LLR = k * ln(k / E[k]) + (N - k) * ln((N - k) / (N - E[k]))
Lambda = max_zones LLR(zone)
```

---

## 6. Signal Linking and Causality

### Temporal Distance

```txt
Delta_t = |t2 - t1|
```

### Geographic Distance

Haversine distance:

```txt
a = sin^2(Delta_phi / 2) + cos(phi_1)cos(phi_2)sin^2(Delta_lambda / 2)
c = 2 * atan2(sqrt(a), sqrt(1 - a))
d = R * c
```

Where `R = 6371 km`.

### Network Distance

For dependency graphs, agency hierarchies, administrative networks, or non-geographic domains:

```txt
d_network(s1, s2) = shortest_path_length(s1, s2)
```

The adjacency kernel is:

```txt
s_g = exp(-d_network^2 / (2sigma^2))
```

Where `sigma` is measured in graph hops.

### Orbital Parameter Distance

For space domains:

```txt
d_orbital(sat1, sat2) = ||r1 - r2|| + k||v1 - v2||
```

Where `r` is position vector, `v` is velocity vector, and `k` is a velocity weight.

### Normalized Temporal Similarity

```txt
s_t = 1 - Delta_t / Delta_t_max
```

### Spatial Similarity

```txt
s_g = exp(-d^2 / (2sigma^2))
```

### Joint Similarity

```txt
S = s_t * s_g
```

This works for any metric space: geographic, network, orbital, or other validated domain metrics.

### Granger Causality

Autoregressive baseline:

```txt
B(t) = alpha_0 + sum_i alpha_i B(t-i) + epsilon_1
```

Predictor model:

```txt
B(t) = beta_0 + sum_i beta_i B(t-i) + sum_j gamma_j A(t-j) + epsilon_2
```

F-statistic:

```txt
F = [(SSR_1 - SSR_2) / p] / [SSR_2 / (n - 2p - 1)]
```

If `F > F_critical(p, n - 2p - 1, alpha)`, then `A` Granger-causes `B` under the selected lag specification.

---

## 7. Action Prioritization

### Multi-Attribute Utility Function

```txt
U = sum_i w_i u_i
```

Where `sum w_i = 1` and each utility `u_i` is normalized to `[0, 1]`.

### Standard Utility Attributes

Urgency:

```txt
u_urgency = 1 - t_remaining / t_deadline
```

Equity:

```txt
u_equity = V_index
```

Feasibility:

```txt
u_feasibility = R_available / R_required
```

Impact:

```txt
u_impact = (x - x_min) / (x_max - x_min)
```

### Weighted Priority Score

```txt
Priority = 10 * (0.4u_urgency + 0.3u_equity + 0.2u_feasibility + 0.1u_confidence)
```

Priority is bounded in `[0, 10]`.

---

## 8. Matrix Algebra

### Spatial Covariance Matrix

```txt
Sigma = E[(X - mu)(X - mu)^T]
```

### Eigenvalue Decomposition

```txt
Sigma = Q Lambda Q^T
```

### Principal Components

```txt
Z = Q^T(X - mu)
Var(Z_i) = lambda_i
```

### Geographic Transform Matrix

```txt
W = [w_ij], where w_ij = A(s_i intersect t_j) / A(s_i)
```

`W` is row-stochastic:

```txt
sum_j w_ij = 1
```

### Signal Allocation

```txt
c' = Wc
```

### Composition

```txt
W3 = W2W1
```

A transform from `s -> t -> u` should equal the composed transform `s -> u` within numerical tolerance.

---

## 9. Graph Theory

### Adjacency Matrix

```txt
A = [a_ij], where a_ij = similarity(signal_i, signal_j)
```

### Degree Matrix

```txt
D = diag(d_1, d_2, ..., d_n), where d_i = sum_j a_ij
```

### Graph Laplacian

```txt
L = D - A
```

### Normalized Laplacian

```txt
L_norm = I - D^-1/2 A D^-1/2
```

### Connected Components

The number of connected components equals the multiplicity of eigenvalue `0`.

### PageRank

```txt
r = ((1 - d) / n) * 1 + d * A^T r
```

With iterative solution:

```txt
r^(k+1) = ((1 - d) / n) * 1 + d * A^T r^(k)
```

---

## 10. Differential Equations and Time Series

### State-Space Model

```txt
x_t = F_t x_{t-1} + B_t u_t + w_t
y_t = H_t x_t + v_t
```

Where `w_t ~ N(0, Q)` and `v_t ~ N(0, R)`.

### Kalman Prediction

```txt
x_hat_{t|t-1} = F_t x_hat_{t-1|t-1} + B_t u_t
P_{t|t-1} = F_t P_{t-1|t-1} F_t^T + Q
```

### Kalman Update

```txt
K_t = P_{t|t-1} H_t^T (H_t P_{t|t-1} H_t^T + R)^-1
x_hat_{t|t} = x_hat_{t|t-1} + K_t(y_t - H_t x_hat_{t|t-1})
P_{t|t} = (I - K_t H_t)P_{t|t-1}
```

### ARIMA

```txt
phi(B)(1 - B)^d y_t = theta(B)epsilon_t
```

### Vector Autoregression

```txt
Y_t = sum_{i=1}^p A_i Y_{t-i} + epsilon_t
```

---

## 11. Probability Theory

### Moment Generating Function

```txt
M_X(t) = E[e^(tX)]
```

### Characteristic Function

```txt
phi_X(t) = E[e^(itX)]
```

### Central Limit Theorem

```txt
(S_n - nmu) / (sigma sqrt(n)) ->^d N(0, 1)
```

### Kolmogorov-Smirnov Statistic

```txt
D_n = sup_x |F_n(x) - F(x)|
```

### Chi-Square Goodness of Fit

```txt
chi^2 = sum_i (O_i - E_i)^2 / E_i
```

### Bayes' Theorem

```txt
p(theta | x) = p(x | theta)p(theta) / p(x)
posterior proportional to likelihood * prior
```

---

## 12. Optimization Theory

### Lagrangian

```txt
L(x, lambda) = f(x) + sum_i lambda_i g_i(x)
```

### KKT Conditions

```txt
grad f(x*) + sum_i lambda_i grad g_i(x*) + sum_j mu_j grad h_j(x*) = 0
g_i(x*) = 0
h_j(x*) <= 0
mu_j >= 0
mu_j h_j(x*) = 0
```

### Gradient Descent

```txt
x^(k+1) = x^(k) - alpha_k grad f(x^(k))
```

### Pareto Optimality

A point is Pareto optimal if no other feasible point improves at least one objective without worsening another.

---

## 13. Information Theory

### Entropy

```txt
H(X) = -sum_i p(x_i) log p(x_i)
```

### Mutual Information

```txt
I(X;Y) = H(X) + H(Y) - H(X,Y)
```

### KL Divergence

```txt
D_KL(P || Q) = sum_i p(x_i) log(p(x_i) / q(x_i))
```

### Cross Entropy

```txt
H(P, Q) = H(P) + D_KL(P || Q)
```

---

## 14. Stochastic Processes

### Markov Chain

```txt
P(X_n = j | X_{n-1} = i, X_{n-2}, ...) = P(X_n = j | X_{n-1} = i)
```

### Transition Matrix

```txt
P = [p_ij]
```

### Stationary Distribution

```txt
pi = pi P
```

### Poisson Process

```txt
N(t) ~ Poisson(lambda t)
```

### Brownian Motion

```txt
W(0) = 0
W(t) - W(s) ~ N(0, t - s)
```

---

## 15. Measure Theory

### Measure Space

```txt
(Omega, F, mu)
```

### Axioms

```txt
mu(empty) = 0
mu(A) >= 0
mu(union_i A_i) = sum_i mu(A_i) for disjoint A_i
```

### Radon-Nikodym Derivative

```txt
dnu / dmu = f, where nu << mu
```

### Fubini's Theorem

```txt
integral integral f d(mu x nu) = integral(integral f dnu)dmu
```

---

## 16. Functional Analysis

### Inner Product

```txt
<x, y> = <y, x>*
<alpha x + beta y, z> = alpha<x, z> + beta<y, z>
<x, x> >= 0
```

### Cauchy-Schwarz

```txt
|<x, y>| <= ||x|| ||y||
```

### Orthonormal Basis

```txt
x = sum_i <x, e_i>e_i
||x||^2 = sum_i |<x, e_i>|^2
```

---

## 17. Numerical Analysis

### Newton Root Finding

```txt
x_{n+1} = x_n - f(x_n) / f'(x_n)
```

### Trapezoid Rule

```txt
integral_a^b f(x)dx approx h/2[f(a) + 2sum f(x_i) + f(b)]
```

### Runge-Kutta 4

```txt
k1 = f(t_n, y_n)
k2 = f(t_n + h/2, y_n + hk1/2)
k3 = f(t_n + h/2, y_n + hk2/2)
k4 = f(t_n + h, y_n + hk3)
y_{n+1} = y_n + h/6(k1 + 2k2 + 2k3 + k4)
```

---

## 18. Topology

### Metric Space

```txt
d: X x X -> R_+
d(x, y) = 0 iff x = y
d(x, y) = d(y, x)
d(x, z) <= d(x, y) + d(y, z)
```

### Open Ball

```txt
B(x, r) = {y : d(x, y) < r}
```

### Continuous Map

```txt
f: X -> Y is continuous iff f^-1(V) is open for every open V
```

---

## 19. Category Theory and Domain Abstraction

### Category

```txt
Ob(C) = objects
Mor(C) = morphisms
Hom(A, B) = {f: A -> B}
```

### Functor

```txt
F: C -> D
F(1_A) = 1_{F(A)}
F(g o f) = F(g) o F(f)
```

Atlas-Prism omnidirectionality can be described as a structure-preserving mapping from domain-specific categories into the universal signal category.

---

## 20. Omnidirectionality Proof

### Theorem

The Atlas-Prism convergence detection engine operates identically across arbitrary domains `D1, D2, ..., Dn` provided each domain admits:

1. a temporal coordinate `t in R`
2. a spatial/network coordinate `G in Geography or Network`
3. a confidence score `c in [0, 1]`
4. a finite set of signal types `T`

### Proof Sketch

Let:

```txt
F: Domain -> UniversalSignalSpace
F(signal_D) = (t, G, tau, c, chi)
```

`F` preserves temporal ordering:

```txt
t1 < t2 in Domain implies F(signal1).t < F(signal2).t
```

`F` preserves domain relationships by mapping domain distance into an approved Atlas metric:

```txt
d_Domain(s1, s2) -> d_Universal(F(s1).G, F(s2).G)
```

All convergence operations are defined on the universal signal space:

```txt
Phi: UniversalSignalSpace -> R
```

Therefore, the convergence score for any domain is computed through the same mathematical operations after mapping through `F`. The semantics of the source domain do not alter the convergence algorithm; only the input coordinates, metric, types, confidences, and characteristics do.

---

## Implementation Notes

### Required Data Structures

1. `signal_fingerprint` table with SHA-256 hashing
2. `precedence_weight` table with confidence update history
3. `geography_registry` with PostGIS geography or geometry type
4. `geography_key` for area-weighted crosswalks
5. `civic_map_signals` as the universal signal store
6. `action_queue` with calculated priority scores

### Performance Considerations

- Spatial operations require PostGIS spatial indexes such as GIST.
- Temporal queries require indexing on signal timestamp.
- Convergence detection can use materialized views with periodic refresh.
- Graph operations should use adjacency-list representation for sparse graphs.
- Matrix-heavy transforms should delegate to optimized numerical libraries when scale requires it.

### Validation Requirements

All mathematical operations must satisfy:

1. determinism: same input produces same output
2. monotonicity: more evidence strengthens a signal where applicable
3. boundedness: scores remain in declared ranges
4. conservation: geographic allocations sum to 1.0 within tolerance
5. convergence: iterative algorithms reach stable solutions or emit bounded failure states

---

## Domain Configuration Schema

Each domain requires only classification, normalization, and priority configuration. The core math remains unchanged.

```sql
INSERT INTO signal_classification (signal_type, characteristics_schema)
VALUES ('domain_specific_signal', '{"key1": "type1", "key2": "type2"}');

INSERT INTO geography_key (source_type, target_type, allocation_method)
VALUES ('domain_geography_a', 'domain_geography_b', 'area_weighted');

INSERT INTO priority_config (domain, urgency_weight, equity_weight, feasibility_weight)
VALUES ('domain_name', 0.40, 0.30, 0.30);
```

---

## Worked Example: SNAP Enrollment Drop Signal

Input:

```txt
t = 2026-04-15T00:00:00Z
G = Census Tract 12345
tau = benefit_enrollment_drop
c = 0.85
chi = {"drop_pct": -0.25, "duration_days": 30}
```

Precedence update with eight confirmations and two negations:

```txt
lambda = 1 / sqrt(8 + 2 + 1) = 0.302
P = 0.5 * (1 + (8 - 2) * 0.302) = 1.41 -> clamped to 1.00
W = 0.7(0.85) + 0.3(1.00) = 0.895
```

Geographic allocation:

- District A overlap: `0.60`, allocated confidence `0.895 * 0.60 = 0.537`
- District B overlap: `0.40`, allocated confidence `0.895 * 0.40 = 0.358`

If District A also has eviction filing and emergency utilization signals:

```txt
C2 = 3 * 0.732 * ln(4) * 0.9 = 2.74
```

Priority example:

```txt
u_urgency = 1 - 15 / 30 = 0.50
u_equity = 0.85
u_feasibility = 0.70
u_confidence = 0.895
Priority = 10 * (0.4*0.50 + 0.3*0.85 + 0.2*0.70 + 0.1*0.895) = 6.84
```

---

## Testing and Validation Requirements

### Unit Tests

1. fingerprint uniqueness: 10,000 random normalized signals produce 10,000 unique hashes
2. precedence convergence: confidence weights converge toward true accuracy over repeated trials
3. geographic conservation: allocation weights sum to `1.0 +/- 1e-10`
4. convergence monotonicity: additional distinct signal types do not lower convergence score when other terms are held constant
5. priority boundedness: priority scores remain within `[0, 10]`

### Integration Tests

1. cross-domain equivalence: equivalent universal inputs produce equivalent convergence results across unrelated domains
2. temporal consistency: signal linking produces symmetric similarity scores where the configured metric is symmetric
3. spatial transform composition: `A -> B -> C` equals composed `A -> C` within numerical tolerance

### Statistical Validation

1. null distribution verification: Poisson spatial scan produces expected Type I error rate
2. Granger causality calibration: F-statistic matches theoretical distribution under the null
3. confidence interval coverage: Bayesian posteriors, when used, achieve nominal coverage

---

## Mathematical References

- Royden and Fitzpatrick, *Real Analysis*
- Rudin, *Functional Analysis*
- Grimmett and Stirzaker, *Probability and Random Processes*
- Boyd and Vandenberghe, *Convex Optimization*
- Cover and Thomas, *Elements of Information Theory*
- Mac Lane, *Categories for the Working Mathematician*
- Cressie and Wikle, *Statistics for Spatio-Temporal Data*
- Kulldorff, *A spatial scan statistic*
- Anselin, *Local Indicators of Spatial Association—LISA*
- Hamilton, *Time Series Analysis*
- Granger, *Investigating Causal Relations by Econometric Models*
- Luetkepohl, *New Introduction to Multiple Time Series Analysis*
