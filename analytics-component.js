// Self-invoking function to encapsulate all logic and avoid polluting the global scope.
(function() {
    // --- STATE & INITIALIZATION ---
    let fullData;
    const componentContainer = document.getElementById('course-analytics-component');

    if (!componentContainer) {
        console.error("Analytics Component container not found.");
        return;
    }

    document.addEventListener('DOMContentLoaded', () => {
        showLoadingState();
        fetch('output.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return response.json();
            })
            .then(flatData => {
                fullData = getLearningSystemHierarchy(flatData);
                if (fullData.message) {
                    showErrorState(fullData.message);
                    return;
                }
                initializeAppUI();
                attachEventListeners();
            })
            .catch(error => {
                showErrorState(error.message);
                console.error("Analytics Component Error:", error);
            });
    });

    // --- UI CONSTRUCTION & RENDERING ---
    
    function showLoadingState() { componentContainer.innerHTML = `<div class="analytics-loading">Loading Analytics...</div>`; }
    function showErrorState(message) { componentContainer.innerHTML = `<div class="analytics-loading" style="color:var(--danger-color)">Error: ${message}</div>`; }

    function initializeAppUI() {
        componentContainer.innerHTML = `
            <div class="analytics-tabs">
                <button class="tab-link active" data-view="overview"><i data-feather="trello"></i>Course Overview</button>
                <button class="tab-link" data-view="students"><i data-feather="users"></i>Student Analysis</button>
                <button class="tab-link" data-view="concepts"><i data-feather="book-open"></i>Concept Analysis</button>
                <button class="tab-link" data-view="activities"><i data-feather="zap"></i>Activity Analysis</button>
            </div>
            <div class="view-pane active" id="overview-view"></div>
            <div class="view-pane" id="students-view"></div>
            <div class="view-pane" id="concepts-view"></div>
            <div class="view-pane" id="activities-view"></div>
        `;
        renderAllViews();
        feather.replace();
    }

    function renderAllViews() {
        renderCourseOverview(fullData, document.getElementById('overview-view'));
        renderStudentAnalysis(fullData, document.getElementById('students-view'));
        renderConceptAnalysis(fullData, document.getElementById('concepts-view'));
        renderActivityAnalysis(fullData, document.getElementById('activities-view'));
    }

    // --- EVENT LISTENERS ---

    function attachEventListeners() {
        componentContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab-link');
            if (tab) {
                switchTabs(tab.getAttribute('data-view'));
            }
            const card = event.target.closest('.student-card');
            if (card) {
                const userId = card.getAttribute('data-userid');
                document.querySelectorAll('.student-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                renderStudentDiagnosticPanel(userId, document.getElementById('student-diagnostic-panel'));
            }
        });
    }

    function switchTabs(viewName) {
        componentContainer.querySelectorAll('.tab-link').forEach(link => link.classList.toggle('active', link.getAttribute('data-view') === viewName));
        componentContainer.querySelectorAll('.view-pane').forEach(pane => pane.classList.toggle('active', pane.id === `${viewName}-view`));
    }

    // --- VIEW-SPECIFIC RENDERERS ---

    function renderCourseOverview(data, container) {
        let content = '';
        data.chapters.forEach(chapter => {
            content += `
            <details class="toc-item" ${chapter.chapterNo === 1 ? 'open' : ''}>
                <summary>
                    <div class="toc-title">Chapter ${chapter.chapterNo}: ${chapter.chapterName}</div>
                    <div class="toc-stats">
                        <div class="stat"><div class="stat-value">${truncateToDecimals(chapter.avgAccuracy, 1)}%</div><div class="stat-label">Avg. Accuracy</div></div>
                        <div class="stat"><div class="stat-value">${truncateToDecimals(chapter.completion, 1)}%</div><div class="stat-label">Avg. Completion</div></div>
                    </div>
                </summary>
                <div class="toc-content">
                    <div class="card-list">
                        ${chapter.units.map(unit => {
                            const isProblematic = unit.isProblematic;
                            return `
                            <div class="insight-card ${isProblematic ? 'warning' : 'success'}">
                                <i data-feather="${isProblematic ? 'alert-triangle' : 'check-circle'}"></i>
                                <div>
                                    <p><strong>Unit ${unit.unitNo}: ${unit.unitName}</strong></p>
                                    <p>Avg Accuracy: ${unit.avgAccuracy}%, Avg Time: ${unit.avgTimeSpent}, Learners: ${unit.noOfLearners}</p>
                                    ${isProblematic ? '<p style="font-size: 0.9em; margin-top: 0.5em;"><strong>Insight:</strong> This unit shows signs of difficulty for the cohort (low accuracy and high time spent).</p>' : ''}
                                </div>
                            </div>
                            `
                        }).join('')}
                    </div>
                </div>
            </details>
            `;
        });
        container.innerHTML = `<div class="section"><h3>Course Table of Contents</h3><p class="description">Get a high-level overview of class performance chapter by chapter and unit by unit.</p>${content}</div>`;
        feather.replace();
    }

    function renderStudentAnalysis(data, container) {
        let strugglingHTML = '', onTrackHTML = '', excellingHTML = '';
        const allStudents = new Map();

        data.chapters.forEach(ch => ch.units.forEach(unit => unit.users.forEach(user => {
            if (!allStudents.has(user.userId)) allStudents.set(user.userId, { userName: user.userName, accuracies: [], times: [], isStruggling: false });
            const student = allStudents.get(user.userId);
            if (user.accuracy > 0) student.accuracies.push(user.accuracy);
            student.times.push(parseDurationToSeconds(user.totalTimeSpent));
            if (user.isStruggling) student.isStruggling = true;
        })));
        
        allStudents.forEach((student, userId) => {
            const avgAccuracy = calculateAverage(student.accuracies);
            const totalTime = student.times.reduce((a, b) => a + b, 0);
            const status = student.isStruggling ? "Struggling" : (avgAccuracy > 90 ? "Excelling" : "On-Track");
            const cardHTML = `<div class="student-card" data-userid="${userId}">...</div>`; // simplified
            if (status === 'Struggling') strugglingHTML += cardHTML;
            else if (status === 'Excelling') excellingHTML += cardHTML;
            else onTrackHTML += cardHTML;
        });

        container.innerHTML = `
            <div class="student-analysis-container">
                <div class="student-cohort-list">
                    <div class="section">
                        <h3><i data-feather="alert-triangle" style="color:var(--warning-color)"></i> Struggling</h3>
                        <div class="card-list">${strugglingHTML || "<p>None</p>"}</div>
                    </div>
                     <div class="section">
                        <h3><i data-feather="star" style="color:var(--success-color)"></i> Excelling</h3>
                        <div class="card-list">${excellingHTML || "<p>None</p>"}</div>
                    </div>
                    <div class="section">
                        <h3><i data-feather="users" style="color:var(--primary-color)"></i> On-Track</h3>
                        <div class="card-list">${onTrackHTML || "<p>None</p>"}</div>
                    </div>
                </div>
                <div id="student-diagnostic-panel" class="diagnostic-panel">
                    <!-- Diagnostic content will be rendered here -->
                </div>
            </div>`;
        
        renderStudentDiagnosticPanel(null, container.querySelector('#student-diagnostic-panel'));
        feather.replace();
    }
    
    function renderStudentDiagnosticPanel(userId, container) {
        if (!userId) {
            container.innerHTML = `
                <div class="empty-diagnostic">
                    <i data-feather="user-check"></i>
                    <h3>Select a student to view their diagnostic report.</h3>
                    <p>Click on any student card to the left to see a detailed analysis of their performance and learning patterns.</p>
                </div>`;
            feather.replace();
            return;
        }

        let studentPerformances = [], totalAttempts = 0, activityCount = 0;
        let strugglingConcepts = new Map();
        
        fullData.chapters.forEach(ch => ch.units.forEach(unit => {
            const user = unit.users.find(u => u.userId === userId);
            if (user) {
                user.activities.forEach(act => {
                    totalAttempts += act.totalAttempts;
                    activityCount++;
                    act.performanceByCategory.forEach(cat => cat.components.forEach(comp => comp.elements.forEach(el => {
                        if (el.accuracy < 60) strugglingConcepts.set(el.elementName, el.accuracy);
                    })));
                });
            }
        }));
        
        const avgAccuracy = calculateAverage(fullData.chapters.flatMap(c=>c.units.flatMap(u=>u.users.filter(usr=>usr.userId === userId).map(usr=>usr.accuracy))));
        const avgAttemptsPerActivity = totalAttempts / (activityCount || 1);
        let learningPattern = { type: "Methodical", description: "Student is progressing at a steady pace.", icon: "coffee", class: "success" };
        if (avgAttemptsPerActivity > 15 && avgAccuracy < 70) learningPattern = { type: "Persistence without Mastery", description: "High attempts without accuracy gains suggests guessing or a core misconception.", icon: "repeat", class: "warning" };
        else if (avgAccuracy < 60) learningPattern = { type: "Knowledge Gap", description: "Low accuracy suggests a potential gap in foundational knowledge.", icon: "x-circle", class: "danger" };
        
        container.innerHTML = `
            <div class="section">
                <h3><i data-feather="bar-chart-2"></i> Learning Pattern (The "Why")</h3>
                <div class="insight-card ${learningPattern.class}">
                    <i data-feather="${learningPattern.icon}"></i>
                    <p><strong>${learningPattern.type}:</strong> ${learningPattern.description}</p>
                </div>
            </div>
            <div class="section">
                <h3><i data-feather="map-pin"></i> Struggling Concepts (The "Where")</h3>
                <div class="card-list">
                    ${strugglingConcepts.size > 0 ? Array.from(strugglingConcepts.entries()).map(([name, accuracy]) => `...`).join('') : '<p>No specific concept struggles found.</p>'}
                </div>
            </div>`;
        feather.replace();
    }
    
    function renderConceptAnalysis(data, container) {
        const conceptMap = new Map();
        data.chapters.forEach(ch => ch.units.forEach(unit => unit.users.forEach(user => user.activities.forEach(activity => activity.performanceByCategory.forEach(cat => cat.components.forEach(comp => comp.elements.forEach(el => {
            if (!conceptMap.has(el.elementId)) conceptMap.set(el.elementId, { name: el.elementName, accuracies: [], attempts: [] });
            const concept = conceptMap.get(el.elementId);
            if (el.accuracy > 0) concept.accuracies.push(el.accuracy);
            // This assumes attempts data is available per concept, which it isn't in the flat structure. We'll simulate it.
            const userActivity = user.activities.find(a => a.performanceByCategory.some(c=>c.components.some(p=>p.elements.some(e=>e.elementId === el.elementId))));
            if(userActivity) concept.attempts.push(userActivity.totalAttempts);
        })))))));

        const concepts = Array.from(conceptMap.values()).map(c => {
            const avgAccuracy = calculateAverage(c.accuracies);
            const avgAttempts = calculateAverage(c.attempts);
            const difficulty = (100 - avgAccuracy) * (avgAttempts > 1 ? avgAttempts : 1.1);
            return { ...c, avgAccuracy, avgAttempts, difficulty };
        }).sort((a, b) => b.difficulty - a.difficulty);

        container.innerHTML = `<div class="section"><h3>Concept Performance & Difficulty</h3><p class="description">Concepts are ranked by a "Difficulty Index," which combines low accuracy with high learner effort.</p><div class="grid-layout">${concepts.map(c => `
            <div class="analysis-card">
                <div class="name">${c.name}</div>
                <div class="analysis-card-body">
                    <div class="stat"><div class="difficulty-score ${c.difficulty > 800 ? 'high' : c.difficulty > 400 ? 'medium' : 'low'}">${truncateToDecimals(c.difficulty, 0)}</div><div class="stat-label">Difficulty Index</div></div>
                    <div class="stat"><div class="stat-value">${truncateToDecimals(c.avgAccuracy, 1)}%</div><div class="stat-label">Avg. Accuracy</div></div>
                    <div class="stat"><div class="stat-value">${truncateToDecimals(c.avgAttempts, 1)}</div><div class="stat-label">Avg. Attempts</div></div>
                </div>
            </div>`).join('')}</div></div>`;
    }
    
    function renderActivityAnalysis(data, container) {
        const activityMap = new Map();
        data.chapters.forEach(ch => ch.units.forEach(unit => unit.users.forEach(user => user.activities.forEach(act => {
            if (!activityMap.has(act.activityName)) activityMap.set(act.activityName, { accuracies: [], attempts: [] });
            const activity = activityMap.get(act.activityName);
            activity.accuracies.push(act.accuracy);
            activity.attempts.push(act.totalAttempts);
        }))));
        
        container.innerHTML = `<div class="section"><h3>Activity Type Effectiveness</h3><p class="description">Analyze which teaching methods are most effective for this cohort.</p><div class="grid-layout">${Array.from(activityMap.entries()).map(([name, data]) => {
            const avgAccuracy = calculateAverage(data.accuracies);
            const avgAttempts = calculateAverage(data.attempts);
            let effectiveness = { text: "Effective", class: "success" };
            if (avgAccuracy < 70 && avgAttempts > 10) effectiveness = { text: "Needs Review", class: "danger" };
            else if (avgAccuracy < 80) effectiveness = { text: "Moderate", class: "warning" };
            return `
            <div class="analysis-card">
                <div class="name">${name}</div>
                <div class="insight-card ${effectiveness.class}"><i data-feather="award"></i> <p><strong>Effectiveness:</strong> ${effectiveness.text}</p></div>
                <div class="analysis-card-body">
                    <div class="stat"><div class="stat-value">${truncateToDecimals(avgAccuracy, 1)}%</div><div class="stat-label">Avg. Accuracy</div></div>
                    <div class="stat"><div class="stat-value">${truncateToDecimals(avgAttempts, 1)}</div><div class="stat-label">Avg. Attempts</div></div>
                </div>
            </div>`;
        }).join('')}</div></div>`;
        feather.replace();
    }
    
    // --- DATA TRANSFORMATION & HELPERS ---
    
    const truncateToDecimals = (num, d = 2) => { const n = parseFloat(num); if (isNaN(n)) return 0; return parseFloat(n.toFixed(d)); };
    const calculateAverage = (arr) => { if (!arr || arr.length === 0) return 0; const sum = arr.reduce((acc, val) => acc + val, 0); return sum / arr.length; };
    const formatSecondsToDuration = (s) => { if (isNaN(s) || s < 0) return "00:00:00"; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60); return [h, m, sec].map(v => v.toString().padStart(2, '0')).join(':'); };
    const parseTimeObjectToSeconds = (t) => { if (!t) return 0; if (typeof t === 'string') return parseDurationToSeconds(t); return (t.hours || 0) * 3600 + (t.minutes || 0) * 60 + (t.seconds || 0); };
    const parseDurationToSeconds = (d) => { if (!d || typeof d !== 'string') return 0; const p = d.split(':').map(Number); return p.length !== 3 ? 0 : p[0] * 3600 + p[1] * 60 + p[2]; };
    const getLearningSystemHierarchy = (flatData) => {
        if (!flatData || flatData.length === 0) { return { message: "No data found for the specified criteria." }; }
        const root = { chapters: [] };
        const chaptersMap = new Map();
        for (const row of flatData) {
            if (!chaptersMap.has(row.ChapterId)) { chaptersMap.set(row.ChapterId, { chapterId: String(row.ChapterId), chapterNo: row.ChapterNo, chapterName: row.ChapterName, _unitsMap: new Map() }); }
            const chapter = chaptersMap.get(row.ChapterId);
            if (row.UnitId && !chapter._unitsMap.has(row.UnitId)) { chapter._unitsMap.set(row.UnitId, { unitId: String(row.UnitId), unitNo: row.UnitNo, unitName: row.UnitName, _activitiesMap: new Map(), _usersMap: new Map() }); }
            const unit = chapter._unitsMap.get(row.UnitId);
            if (!unit) continue;
            if (row.ActivityTypeId && !unit._activitiesMap.has(row.SequenceBuilderID)) { unit._activitiesMap.set(row.SequenceBuilderID, { activityId: `${row.UnitId}-${row.ActivityTypeId}-${row.SequenceBuilderID}`, activityName: row.ActivityTypeName, concepts: [] }); }
            const activity = unit._activitiesMap.get(row.SequenceBuilderID);
            if (activity && row.ConceptId && !activity.concepts.some(c => c.conceptId === String(row.ConceptId))) { activity.concepts.push({ conceptId: String(row.ConceptId), conceptName: row.ConceptName, conceptCategory: row.ConceptCategory }); }
            if (row.UserId) {
                if (!unit._usersMap.has(row.UserId)) { unit._usersMap.set(row.UserId, { userId: String(row.UserId), userName: row.UserFullName, completion: parseFloat(row.UnitCompletionPercentage) || 0, accuracy: parseFloat(row.UnitAccuracyPercentage) || 0, totalTimeSpentSeconds: parseTimeObjectToSeconds(row.UnitTimeSpent), _activityPerformanceMap: new Map() }); }
                const user = unit._usersMap.get(row.UserId);
                if (activity && !user._activityPerformanceMap.has(activity.activityId)) { user._activityPerformanceMap.set(activity.activityId, { activityName: activity.activityName, accuracy: truncateToDecimals(row.ActivityTypeAccuracyPercentage, 2) || 0, totalAttempts: row.ActivityTotalAttempts, performanceByCategory: [] }); }
                if (activity && row.ConceptId) {
                    const activityPerformance = user._activityPerformanceMap.get(activity.activityId);
                    const category = activityPerformance.performanceByCategory.find(c => c.category === row.ConceptCategory);
                    if (!category) activityPerformance.performanceByCategory.push({ category: row.ConceptCategory, components: [] });
                    const currentCategory = activityPerformance.performanceByCategory.find(c => c.category === row.ConceptCategory);
                    const component = currentCategory.components.find(c => c.componentId === String(row.ConceptParentId));
                    if (!component) currentCategory.components.push({ componentId: String(row.ConceptParentId), componentName: row.ConceptParentName, elements: [] });
                    const currentComponent = currentCategory.components.find(c => c.componentId === String(row.ConceptParentId));
                    if (!currentComponent.elements.some(e => e.elementId === String(row.ConceptId))) currentComponent.elements.push({ elementId: String(row.ConceptId), elementName: row.ConceptName, accuracy: truncateToDecimals(row.ConceptAccuracyPercentage, 2) || 0 });
                }
            }
        }
        const courseAverageTimePerUnit = calculateAverage(flatData.filter(r => r.UserId && r.UnitTimeSpent).map(r => parseTimeObjectToSeconds(r.UnitTimeSpent)));
        root.chapters = Array.from(chaptersMap.values()).sort((a, b) => a.chapterNo - b.chapterNo).map(chapter => {
            let chapterAccuracies = [], chapterCompletions = [];
            const units = Array.from(chapter._unitsMap.values()).sort((a, b) => a.unitNo - b.unitNo).map(unit => {
                const avgUnitTimePerUser = unit._usersMap.size > 0 ? Array.from(unit._usersMap.values()).reduce((sum, u) => sum + u.totalTimeSpentSeconds, 0) / unit._usersMap.size : 0;
                const users = Array.from(unit._usersMap.values()).map(user => {
                    chapterAccuracies.push(user.accuracy);
                    chapterCompletions.push(user.completion);
                    return {
                        userId: user.userId, userName: user.userName, accuracy: user.accuracy, completion: user.completion,
                        activities: Array.from(user._activityPerformanceMap.values()),
                        isStruggling: user.accuracy < 50 && user.totalTimeSpentSeconds > avgUnitTimePerUser,
                        totalTimeSpent: formatSecondsToDuration(user.totalTimeSpentSeconds),
                    };
                });
                const avgUnitAccuracy = calculateAverage(users.map(u => u.accuracy).filter(a => a > 0));
                return {
                    unitId: unit.unitId, unitNo: unit.unitNo, unitName: unit.unitName,
                    noOfLearners: users.length, avgAccuracy: truncateToDecimals(avgUnitAccuracy),
                    avgTimeSpent: formatSecondsToDuration(avgUnitTimePerUser),
                    isProblematic: avgUnitAccuracy < 60 && avgUnitTimePerUser > courseAverageTimePerUnit,
                    users: users,
                };
            });
            return {
                chapterId: chapter.chapterId, chapterNo: chapter.chapterNo, chapterName: chapter.chapterName, units: units,
                avgAccuracy: calculateAverage(chapterAccuracies), completion: calculateAverage(chapterCompletions)
            };
        });
        const allUsers = new Set(flatData.map(r => r.UserId).filter(Boolean));
        root.noOfLearners = allUsers.size;
        root.avgAccuracy = truncateToDecimals(calculateAverage(root.chapters.flatMap(c => c.units.map(u => u.avgAccuracy)).filter(a => a > 0)));
        root.completion = truncateToDecimals(calculateAverage(root.chapters.flatMap(c => c.units.flatMap(u => u.users.map(user => user.completion)))));
        root.totalTimeSpent = formatSecondsToDuration(root.chapters.flatMap(c => c.units.flatMap(u => u.users.map(user => parseDurationToSeconds(user.totalTimeSpent)))).reduce((sum, time) => sum + time, 0));
        return root;
    };
})();