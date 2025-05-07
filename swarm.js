// Constantes y variables globales
const WIDTH = 800;
const HEIGHT = 600;
const MAX_SPEED = 3;
const PERCEPTION_RADIUS = 50;

// Estado de la simulación
let robots = [];
let obstacles = [];
let goals = [];
let goalsReached = 0;
let lastFrameTime = 0;
let fps = 0;

// Referencias a elementos DOM
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

// Clase Vector para operaciones vectoriales
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    add(vector) {
        return new Vector(this.x + vector.x, this.y + vector.y);
    }
    
    subtract(vector) {
        return new Vector(this.x - vector.x, this.y - vector.y);
    }
    
    multiply(scalar) {
        return new Vector(this.x * scalar, this.y * scalar);
    }
    
    divide(scalar) {
        if (scalar === 0) return new Vector(0, 0);
        return new Vector(this.x / scalar, this.y / scalar);
    }
    
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    
    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector(0, 0);
        return this.divide(mag);
    }
    
    limit(max) {
        if (this.magnitude() > max) {
            return this.normalize().multiply(max);
        }
        return new Vector(this.x, this.y);
    }
    
    static distance(v1, v2) {
        return Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));
    }
}

// Clase Robot
class Robot {
    constructor(x, y) {
        this.position = new Vector(x, y);
        const angle = Math.random() * Math.PI * 2;
        this.velocity = new Vector(Math.cos(angle), Math.sin(angle)).multiply(Math.random() + 0.5);
        this.acceleration = new Vector(0, 0);
        this.maxSpeed = MAX_SPEED;
        this.perceptionRadius = PERCEPTION_RADIUS;
        this.size = 5;
    }
    
    applySeparation(robots) {
        if (!document.getElementById('separation').checked) return new Vector(0, 0);
        
        const steeringForce = new Vector(0, 0);
        let total = 0;
        
        for (const other of robots) {
            const distance = Vector.distance(this.position, other.position);
            if (other !== this && distance < this.perceptionRadius) {
                const diff = this.position.subtract(other.position);
                if (distance > 0) {
                    // La fuerza es inversamente proporcional a la distancia
                    diff.divide(distance);
                    steeringForce.x += diff.x;
                    steeringForce.y += diff.y;
                    total++;
                }
            }
        }
        
        if (total > 0) {
            steeringForce.x /= total;
            steeringForce.y /= total;
            
            const magnitude = Math.sqrt(steeringForce.x * steeringForce.x + steeringForce.y * steeringForce.y);
            if (magnitude > 0) {
                steeringForce.x = (steeringForce.x / magnitude) * this.maxSpeed;
                steeringForce.y = (steeringForce.y / magnitude) * this.maxSpeed;
                steeringForce.x -= this.velocity.x;
                steeringForce.y -= this.velocity.y;
            }
        }
        
        const weight = parseFloat(document.getElementById('separationWeight').value);
        return new Vector(steeringForce.x * weight, steeringForce.y * weight);
    }
    
    applyAlignment(robots) {
        if (!document.getElementById('alignment').checked) return new Vector(0, 0);
        
        const steeringForce = new Vector(0, 0);
        let total = 0;
        
        for (const other of robots) {
            const distance = Vector.distance(this.position, other.position);
            if (other !== this && distance < this.perceptionRadius) {
                steeringForce.x += other.velocity.x;
                steeringForce.y += other.velocity.y;
                total++;
            }
        }
        
        if (total > 0) {
            steeringForce.x /= total;
            steeringForce.y /= total;
            
            const magnitude = Math.sqrt(steeringForce.x * steeringForce.x + steeringForce.y * steeringForce.y);
            if (magnitude > 0) {
                steeringForce.x = (steeringForce.x / magnitude) * this.maxSpeed;
                steeringForce.y = (steeringForce.y / magnitude) * this.maxSpeed;
                steeringForce.x -= this.velocity.x;
                steeringForce.y -= this.velocity.y;
            }
        }
        
        const weight = parseFloat(document.getElementById('alignmentWeight').value);
        return new Vector(steeringForce.x * weight, steeringForce.y * weight);
    }
    
    applyCohesion(robots) {
        if (!document.getElementById('cohesion').checked) return new Vector(0, 0);
        
        const center = new Vector(0, 0);
        let total = 0;
        
        for (const other of robots) {
            const distance = Vector.distance(this.position, other.position);
            if (other !== this && distance < this.perceptionRadius) {
                center.x += other.position.x;
                center.y += other.position.y;
                total++;
            }
        }
        
        if (total > 0) {
            center.x /= total;
            center.y /= total;
            
            const desired = new Vector(
                center.x - this.position.x,
                center.y - this.position.y
            );
            
            const magnitude = Math.sqrt(desired.x * desired.x + desired.y * desired.y);
            if (magnitude > 0) {
                desired.x = (desired.x / magnitude) * this.maxSpeed;
                desired.y = (desired.y / magnitude) * this.maxSpeed;
            }
            
            const steeringForce = new Vector(
                desired.x - this.velocity.x,
                desired.y - this.velocity.y
            );
            
            const weight = parseFloat(document.getElementById('cohesionWeight').value);
            return new Vector(steeringForce.x * weight, steeringForce.y * weight);
        }
        
        return new Vector(0, 0);
    }
    
    avoidObstacles(obstacles) {
        if (!document.getElementById('avoidObstacles').checked) return new Vector(0, 0);
        
        const steeringForce = new Vector(0, 0);
        
        for (const obstacle of obstacles) {
            const distance = Vector.distance(this.position, obstacle.position);
            if (distance < this.perceptionRadius + obstacle.radius) {
                const diff = this.position.subtract(obstacle.position);
                const magnitude = diff.magnitude();
                if (magnitude > 0) {
                    // La fuerza es inversamente proporcional al cuadrado de la distancia
                    const factor = (this.perceptionRadius / Math.max(0.1, distance)) ** 2;
                    diff.x = (diff.x / magnitude) * factor;
                    diff.y = (diff.y / magnitude) * factor;
                    steeringForce.x += diff.x;
                    steeringForce.y += diff.y;
                }
            }
        }
        
        const weight = parseFloat(document.getElementById('obstacleWeight').value);
        return new Vector(steeringForce.x * weight, steeringForce.y * weight);
    }
    
    seekGoals(goals) {
        if (!document.getElementById('seekGoals').checked) return new Vector(0, 0);
        
        let closestGoal = null;
        let closestDistance = Infinity;
        
        for (const goal of goals) {
            const distance = Vector.distance(this.position, goal.position);
            if (distance < this.perceptionRadius + goal.radius && distance < closestDistance) {
                closestGoal = goal;
                closestDistance = distance;
            }
        }
        
        if (closestGoal) {
            const desired = new Vector(
                closestGoal.position.x - this.position.x,
                closestGoal.position.y - this.position.y
            );
            
            if (closestDistance < closestGoal.radius) {
                // Si alcanzamos el objetivo
                if (closestGoal.reached === false) {
                    closestGoal.reached = true;
                    goalsReached++;
                    document.getElementById('goalsReached').textContent = goalsReached;
                }
            }
            
            const magnitude = desired.magnitude();
            if (magnitude > 0) {
                desired.x = (desired.x / magnitude) * this.maxSpeed;
                desired.y = (desired.y / magnitude) * this.maxSpeed;
            }
            
            const steeringForce = new Vector(
                desired.x - this.velocity.x,
                desired.y - this.velocity.y
            );
            
            const weight = parseFloat(document.getElementById('goalWeight').value);
            return new Vector(steeringForce.x * weight, steeringForce.y * weight);
        }
        
        return new Vector(0, 0);
    }
    
    applyBehaviors(robots, obstacles, goals) {
        const separation = this.applySeparation(robots);
        const alignment = this.applyAlignment(robots);
        const cohesion = this.applyCohesion(robots);
        const avoidance = this.avoidObstacles(obstacles);
        const seeking = this.seekGoals(goals);
        
        this.acceleration.x += separation.x + alignment.x + cohesion.x + avoidance.x + seeking.x;
        this.acceleration.y += separation.y + alignment.y + cohesion.y + avoidance.y + seeking.y;
    }
    
    update() {
        // Actualizar velocidad
        this.velocity.x += this.acceleration.x;
        this.velocity.y += this.acceleration.y;
        
        // Limitar velocidad
        const speed = this.velocity.magnitude();
        if (speed > this.maxSpeed) {
            this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
            this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
        }
        
        // Actualizar posición
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
        
        // Reiniciar aceleración
        this.acceleration.x = 0;
        this.acceleration.y = 0;
        
        // Mantener dentro de los límites (efecto "wrap-around")
        if (this.position.x > WIDTH) {
            this.position.x = 0;
        } else if (this.position.x < 0) {
            this.position.x = WIDTH;
        }
        
        if (this.position.y > HEIGHT) {
            this.position.y = 0;
        } else if (this.position.y < 0) {
            this.position.y = HEIGHT;
        }
    }
    
    draw(ctx) {
        // Calcular el ángulo de dirección
        const angle = Math.atan2(this.velocity.y, this.velocity.x);
        
        // Dibujar robot como triángulo para mostrar dirección
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(angle);
        ctx.fillStyle = 'white';
        
        // Triángulo
        ctx.beginPath();
        ctx.moveTo(this.size * 1.5, 0);
        ctx.lineTo(-this.size, -this.size);
        ctx.lineTo(-this.size, this.size);
        ctx.closePath();
        ctx.fill();
        
        // Radio de percepción (solo para debug)
        // ctx.beginPath();
        // ctx.arc(0, 0, this.perceptionRadius, 0, Math.PI * 2);
        // ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        // ctx.stroke();
        
        ctx.restore();
    }
}

class Obstacle {
    constructor(x, y, radius = 20) {
        this.position = new Vector(x, y);
        this.radius = radius;
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fill();
    }
}

class Goal {
    constructor(x, y, radius = 15) {
        this.position = new Vector(x, y);
        this.radius = radius;
        this.reached = false;
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.reached ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.7)';
        ctx.fill();
    }
}

// Inicializar la simulación
function init() {
    const robotCount = parseInt(document.getElementById('robotCount').value);
    robots = [];
    obstacles = [
        new Obstacle(WIDTH/4, HEIGHT/2, 30),
        new Obstacle(3*WIDTH/4, HEIGHT/2, 40),
        new Obstacle(WIDTH/2, HEIGHT/4, 25)
    ];
    goals = [
        new Goal(WIDTH/2, HEIGHT/2, 20),
        new Goal(WIDTH/6, 5*HEIGHT/6, 15)
    ];
    goalsReached = 0;
    document.getElementById('goalsReached').textContent = '0';
    
    // Crear robots
    for (let i = 0; i < robotCount; i++) {
        robots.push(new Robot(
            Math.random() * WIDTH,
            Math.random() * HEIGHT
        ));
    }
    
    document.getElementById('activeRobots').textContent = robots.length;
}

// Actualizar la simulación
function update() {
    for (const robot of robots) {
        robot.applyBehaviors(robots, obstacles, goals);
    }
    
    for (const robot of robots) {
        robot.update();
    }
}

// Dibujar todo en el canvas
function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    // Dibujar objetivos
    for (const goal of goals) {
        goal.draw(ctx);
    }
    
    // Dibujar obstáculos
    for (const obstacle of obstacles) {
        obstacle.draw(ctx);
    }
    
    // Dibujar robots
    for (const robot of robots) {
        robot.draw(ctx);
    }
}

// Calcular FPS
function calculateFPS(timestamp) {
    if (!lastFrameTime) {
        lastFrameTime = timestamp;
        return 0;
    }
    
    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    return Math.round(1000 / delta);
}

// Bucle principal de animación
function animate(timestamp) {
    // Calcular FPS
    fps = calculateFPS(timestamp);
    document.getElementById('fps').textContent = fps;
    
    update();
    draw();
    requestAnimationFrame(animate);
}

// Configurar controladores de eventos
function setupEventListeners() {
    // Actualizar valores mostrados en los sliders
    document.getElementById('robotCount').addEventListener('input', function() {
        document.getElementById('robotCountValue').textContent = this.value;
    });
    
    document.getElementById('separationWeight').addEventListener('input', function() {
        document.getElementById('separationValue').textContent = this.value;
    });
    
    document.getElementById('alignmentWeight').addEventListener('input', function() {
        document.getElementById('alignmentValue').textContent = this.value;
    });
    
    document.getElementById('cohesionWeight').addEventListener('input', function() {
        document.getElementById('cohesionValue').textContent = this.value;
    });
    
    document.getElementById('obstacleWeight').addEventListener('input', function() {
        document.getElementById('obstacleValue').textContent = this.value;
    });
    
    document.getElementById('goalWeight').addEventListener('input', function() {
        document.getElementById('goalValue').textContent = this.value;
    });
    
    // Botón de reinicio
    document.getElementById('reset').addEventListener('click', init);
    
    // Botón de añadir obstáculo
    document.getElementById('addObstacle').addEventListener('click', function() {
        obstacles.push(new Obstacle(
            Math.random() * WIDTH,
            Math.random() * HEIGHT,
            15 + Math.random() * 25
        ));
    });
    
    // Botón de añadir objetivo
    document.getElementById('addGoal').addEventListener('click', function() {
        goals.push(new Goal(
            Math.random() * WIDTH,
            Math.random() * HEIGHT,
            10 + Math.random() * 15
        ));
    });
    
    // Permitir arrastrar y soltar obstáculos y objetivos
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
}

// Variables para arrastrar y soltar
let isDragging = false;
let draggedObject = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Comprobar si se hizo clic en un obstáculo
    for (const obstacle of obstacles) {
        const distance = Math.sqrt(
            Math.pow(mouseX - obstacle.position.x, 2) + 
            Math.pow(mouseY - obstacle.position.y, 2)
        );
        
        if (distance <= obstacle.radius) {
            isDragging = true;
            draggedObject = obstacle;
            dragOffsetX = mouseX - obstacle.position.x;
            dragOffsetY = mouseY - obstacle.position.y;
            return;
        }
    }
    
    // Comprobar si se hizo clic en un objetivo
    for (const goal of goals) {
        const distance = Math.sqrt(
            Math.pow(mouseX - goal.position.x, 2) + 
            Math.pow(mouseY - goal.position.y, 2)
        );
        
        if (distance <= goal.radius) {
            isDragging = true;
            draggedObject = goal;
            dragOffsetX = mouseX - goal.position.x;
            dragOffsetY = mouseY - goal.position.y;
            return;
        }
    }
}

function handleMouseMove(event) {
    if (!isDragging || !draggedObject) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    draggedObject.position.x = mouseX - dragOffsetX;
    draggedObject.position.y = mouseY - dragOffsetY;
}

function handleMouseUp() {
    isDragging = false;
    draggedObject = null;
}

// Iniciar la simulación
function startSimulation() {
    setupEventListeners();
    init();
    requestAnimationFrame(animate);
}

// Iniciar cuando se carga la página
window.addEventListener('load', startSimulation);