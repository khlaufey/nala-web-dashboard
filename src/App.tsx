
import { useEffect, useState, useRef } from 'react'
import * as ROSLIB from 'roslib'
import './App.css'

function App() {
  const rosRef = useRef<ROSLIB.Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [missionStatus, setMissionStatus] = useState('WAITING')
  const [battery, setBattery] = useState<number | null>(null)
  const [position, setPosition] = useState<{
    x: number | null
    y: number | null
  }>({ x: null, y: null })

  const [activity, setActivity] = useState<string[]>([])
  const [ftpScore, setFtpScore] = useState<string | null>(null)
  const [routePoints, setRoutePoints] = useState<
    { x: number; y: number }[]
  >([])

  // Data monitoring dari Arena Markers
  const spot =
  position.x === null || position.y === null
    ? null
    : position.x >= 1.5 &&
        position.x <= 3.0 &&
        position.y >= 5.4 &&
        position.y <= 6.6
      ? 'Spot 1'
      : position.x >= 21.0 &&
          position.x <= 22.5 &&
          position.y >= 5.4 &&
          position.y <= 6.6
        ? 'Spot 2'
        : 'Dalam Perjalanan'
  const [cargo, setCargo] = useState<number | null>(null)
  const [placedCargo, setPlacedCargo] = useState<number | null>(null)
  const [totalCargo, setTotalCargo] = useState<number | null>(null)
  const [collisions, setCollisions] = useState<number | null>(null)
  const [killSwitch, setKillSwitch] = useState('UNKNOWN')

  useEffect(() => {
    const ros = new ROSLIB.Ros({
      url: 'ws://localhost:9090',
    })

    rosRef.current = ros

    ros.on('connection', () => {
      console.log('Terhubung ke ROS 2!')
      setConnected(true)
    })

    ros.on('error', (error: unknown) => {
      console.error('Rosbridge error:', error)
      setConnected(false)
    })

    ros.on('close', () => {
      console.log('Koneksi ROS 2 terputus')
      setConnected(false)
    })

    // Mission Status
    const missionTopic = new ROSLIB.Topic({
      ros,
      name: '/mission_state',
      messageType: 'std_msgs/msg/String',
    })

    missionTopic.subscribe((message: { data: string }) => {
  const state = message.data.toUpperCase()

  setMissionStatus(state)

  if (state === 'ESTOP') {
    setKillSwitch('ACTIVE')
  } else {
    setKillSwitch('INACTIVE')
  }
})



    // Battery
    const batteryTopic = new ROSLIB.Topic({
      ros,
      name: '/asv/battery',
      messageType: 'sensor_msgs/msg/BatteryState',
    })

    batteryTopic.subscribe((message: { percentage: number }) => {
      if (Number.isFinite(message.percentage)) {
        setBattery(Math.round(message.percentage * 100))
      }
    })

    // Vessel Position
    const odomTopic = new ROSLIB.Topic({
      ros,
      name: '/asv/odom',
      messageType: 'nav_msgs/msg/Odometry',
    })

    odomTopic.subscribe((message: {
      pose: {
        pose: {
          position: {
            x: number
            y: number
          }
        }
      }
    }) => {
      setPosition({
        x: message.pose.pose.position.x,
        y: message.pose.pose.position.y,
      })
    })

    // Activity Log
    const eventsTopic = new ROSLIB.Topic({
      ros,
      name: '/mission/events',
      messageType: 'std_msgs/msg/String',
    })

    
  eventsTopic.subscribe((message: { data: string }) => {
    try {
      const eventData = JSON.parse(message.data)

      const eventNames: Record<string, string> = {
        start: 'Mission started',
        stop: 'Mission stopped',
        reset: 'Mission reset',
        estop: 'Emergency stop activated',
        pick: 'Cargo picked up',
        place: 'Cargo delivered',
        ftp_end: 'FTP attempt completed',
      }

      const eventName =
        eventNames[eventData.event] ?? eventData.event ?? 'Unknown event'

      const time =
        typeof eventData.t === 'number'
          ? `${eventData.t.toFixed(1)}s`
          : ''

      const details: string[] = []

      if (eventData.status) details.push(`Status: ${eventData.status}`)
      if (eventData.score !== undefined) details.push(`Score: ${eventData.score}`)
      if (eventData.collisions !== undefined) {
        details.push(`Collisions: ${eventData.collisions}`)
      }
      if (eventData.reason) details.push(`Reason: ${eventData.reason}`)

      const formattedEvent = [
        time,
        eventName,
        ...details,
      ].filter(Boolean).join(' — ')

      setActivity((previous) =>
        [formattedEvent, ...previous].slice(0, 20)
      )
    } catch {
      setActivity((previous) =>
        [message.data, ...previous].slice(0, 20)
      )
    }
  })


    // FTP Score
    const scoreTopic = new ROSLIB.Topic({
      ros,
      name: '/ftp/score',
      messageType: 'std_msgs/msg/String',
    })


    // Arena Markers - jalur aktual kapal dan status arena
    const markersTopic = new ROSLIB.Topic({
      ros,
      name: '/arena/markers',
      messageType: 'visualization_msgs/msg/MarkerArray',
    })

    markersTopic.subscribe((message: {
      markers: {
        ns: string
        points: { x: number; y: number }[]
        text: string
      }[]
    }) => {
      console.log('DATA MARKERS DITERIMA:', message)
      // Jalur aktual kapal
      const trail = message.markers.find(
        (marker) => marker.ns === 'jejak'
      )

      if (trail) {
        setRoutePoints(
          trail.points.map((point) => ({
            x: point.x,
            y: point.y,
          }))
        )
      }

      // Informasi status arena
      const statusMarker = message.markers.find(
        (marker) => marker.ns === 'status'
      )

      if (statusMarker?.text) {
        const text = statusMarker.text

        const cargoMatch = text.match(/bawa (\d+)/)
        const placedMatch = text.match(/di Spot 2: (\d+)\/(\d+)/)
        const collisionMatch = text.match(/tabrakan (\d+)/)

        console.log('STATUS ARENA:', text)
        console.log('CARGO:', cargoMatch)
        console.log('DELIVERED:', placedMatch)
        console.log('COLLISION:', collisionMatch)

        if (cargoMatch) {
          setCargo(Number(cargoMatch[1]))
        }

        if (placedMatch) {
          setPlacedCargo(Number(placedMatch[1]))
          setTotalCargo(Number(placedMatch[2]))
        }

        if (collisionMatch) {
          setCollisions(Number(collisionMatch[1]))
        }
      }
    })


    scoreTopic.subscribe((message: { data: string }) => {
      try {
        const result = JSON.parse(message.data)

        setFtpScore(JSON.stringify(result, null, 2))
      } catch {
        setFtpScore(message.data)
      }
    })

    return () => {
      missionTopic.unsubscribe()
      batteryTopic.unsubscribe()
      odomTopic.unsubscribe()
      eventsTopic.unsubscribe()
      scoreTopic.unsubscribe()
      markersTopic.unsubscribe()
      rosRef.current = null
      ros.close()
    }
  }, [])

  const handleKillSwitch = () => {
  const ros = rosRef.current

  if (!connected || !ros) {
    alert('ROS 2 belum terhubung!')
    return
  }

  const confirmed = window.confirm(
    'Aktifkan EMERGENCY STOP? Kapal pada simulasi akan dihentikan.'
  )

  if (!confirmed) return

  const estopService = new ROSLIB.Service({
    ros: ros,
    name: '/estop',
    serviceType: 'std_srvs/srv/Trigger',
  })

  estopService.callService(
  {},
  (response: { success: boolean; message: string }) => {
      if (response.success) {
        setKillSwitch('ACTIVE')
        alert(response.message)
      } else {
        alert('E-STOP gagal: ' + response.message)
      }
    }
  )
}

  const statusDescriptions: Record<string, string> = {
  IDLE: 'Waiting for mission to start',
  TRANSIT: 'Vessel is moving between mission locations',
  RUNNING: 'Mission is currently running',
  DONE: 'Mission completed',
  ESTOP: 'Emergency stop is active',
}

  const status = missionStatus.toUpperCase()

  const mapX =
    position.x === null
      ? 70
      : Math.max(70, Math.min(686, 70 + (position.x / 22) * 616))

  const mapY =
    position.y === null
      ? 260
      : Math.max(80, Math.min(260, 260 - (position.y / 8) * 180))

  const baseX =
  routePoints.length > 0
    ? 70 + (routePoints[0].x / 22) * 616
    : 70

  const baseY =
    routePoints.length > 0
      ? 260 - (routePoints[0].y / 8) * 180
      : 260

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">N</div>
          <div>
            <h2>NALA</h2>
            <span>MISSION CONTROL</span>
          </div>
        </div>

        <nav className="navigation">
          <p className="nav-label">MAIN MENU</p>
          <a className="nav-item active" href="#overview">▦ Overview</a>
          <a className="nav-item" href="#camera">▣ Camera View</a>
          <a className="nav-item" href="#mission">⌖ Mission Data</a>
          <a className="nav-item" href="#activity">◷ Activity Log</a>
        </nav>

        <div className="sidebar-bottom">
          <span
            className="connection-dot"
            style={{
              background: connected ? '#22c55e' : '#e7b65e',
            }}
          />
          <div>
            <strong>ROS 2 CONNECTION</strong>
            <small>{connected ? 'Connected · Live Data' : 'Disconnected'}</small>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">AUTONOMOUS SURFACE VEHICLE</p>
            <h1>Mission Dashboard</h1>
          </div>
          <div className="topbar-right">
            <span className="demo-label">
              {connected ? 'LIVE MODE' : 'OFFLINE'}
            </span>
            <span className="operator">OPERATOR</span>
          </div>
        </header>

        <section className="mission-section" id="mission">
          <div>
            <p className="section-label">CURRENT MISSION STATUS</p>
            <h2>{status}</h2>
            <p className="muted">
              {statusDescriptions[status] || 'Waiting for mission data'}
            </p>
          </div>

          <div className="status-list">
            {['IDLE', 'TRANSIT', 'RUNNING', 'DONE'].map((item) => (
              <span
                key={item}
                className={`status ${status === item ? 'idle' : ''}`}
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="camera-card" id="camera">
          <div className="card-heading">
            <div>
              <p className="section-label">VISUAL MONITORING</p>
              <h3>Camera View</h3>
            </div>
            <span className="feed-status">● NO SIGNAL</span>
          </div>

          <div className="camera-screen">
            <div className="camera-placeholder">
              <span className="camera-icon">▣</span>
              <h3>CAMERA FEED</h3>
              <p>Waiting for ROS image topic</p>
              <small>Live camera will appear here</small>
            </div>
            <span className="camera-overlay">CAM 01 · VRX</span>
          </div>
        </section>

        <section className="camera-card map-card" id="map">
          <div className="card-heading">
            <div>
              <p className="section-label">NAVIGATION MONITORING</p>
              <h3>Mission Map</h3>
            </div>
            <span className="feed-status">
              {connected && position.x !== null ? '● LIVE TRACKING' : '● WAITING'}
            </span>
          </div>

          <div className="map-screen">
            <svg viewBox="0 0 760 300" className="mission-map">
              <defs>
                <pattern
                  id="mapGrid"
                  width="30"
                  height="30"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 30 0 L 0 0 0 30"
                    fill="none"
                    stroke="#29445a"
                    strokeWidth="0.7"
                  />
                </pattern>
              </defs>

              <rect width="760" height="300" fill="url(#mapGrid)" />

              {routePoints.length > 1 && (
                <polyline
                  points={routePoints
                    .map((point) => {
                      const x = 70 + (point.x / 22) * 616
                      const y = 260 - (point.y / 8) * 180
                      return `${x},${y}`
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#258ba7"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              <circle cx={baseX} cy={baseY} r="10" fill="#46c6dc" />

              <text
                x={baseX}
                y={baseY - 20}
                textAnchor="middle"
                fill="#dcebf5"
                fontSize="13"
              >
                BASE
              </text>

              <circle cx="420" cy="116" r="10" fill="#e7b65e" />
              <text x="420" y="95" textAnchor="middle" fill="#dcebf5" fontSize="13">
                SPOT 1
              </text>

              <circle cx="686" cy="125" r="10" fill="#e7b65e" />
              <text x="686" y="103" textAnchor="middle" fill="#dcebf5" fontSize="13">
                SPOT 2
              </text>

              {position.x !== null && position.y !== null && (
                <>
                  <circle
                    cx={mapX}
                    cy={mapY}
                    r="13"
                    fill="#46c6dc"
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                  <circle
                    cx={mapX}
                    cy={mapY}
                    r="21"
                    fill="#46c6dc"
                    opacity="0.15"
                  />
                  <text
                    x={mapX}
                    y={mapY - 27}
                    textAnchor="middle"
                    fill="#46c6dc"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    NALA
                  </text>
                </>
              )}
            </svg>
          </div>

          <div className="map-legend">
            <span>🔵 Current Vessel</span>
            <span>🟡 Mission Spot</span>
            <span>〰 Planned Route</span>
          </div>
        </section>

        <section className="section-block">
          <div className="section-title">
            <div>
              <p className="section-label">VESSEL MONITORING</p>
              <h3>Live Telemetry</h3>
            </div>
          </div>

          <div className="stats-grid">
            <article className="stat-card">
              <span className="stat-icon">⌁</span>
              <p>Battery</p>
              <h2>{battery !== null ? battery : '--'}<small>%</small></h2>
              <span className="stat-note">ROS 2 BatteryState</span>
            </article>

            <article className="stat-card">
              <span className="stat-icon">⌖</span>
              <p>Vessel Position</p>
              <h2>
                {position.x !== null && position.y !== null
                  ? `${position.x.toFixed(2)}, ${position.y.toFixed(2)}`
                  : '--, --'}
              </h2>
              <span className="stat-note">X / Y coordinates · map frame</span>
            </article>

            <article className="stat-card">
              <span className="stat-icon">◇</span>
              <p>Current Spot</p>
              <h2>{spot ?? '--'}</h2>
              <span className="stat-note">Based on vessel coordinates</span>
            </article>

            <article className="stat-card">
              <span className="stat-icon">▤</span>
              <p>Cargo Onboard</p>
              <h2>{cargo ?? '--'} <small>items</small></h2>

              <span className="stat-note">
                {placedCargo !== null && totalCargo !== null
                  ? `${placedCargo}/${totalCargo} items delivered`
                  : 'Waiting for cargo data'}
              </span>
            </article>

            <article className="stat-card">
              <span className="stat-icon">⚠</span>
              <p>Collision Count</p>
              <h2>{collisions ?? '--'}</h2>
              <span className="stat-note">
                {collisions !== null
                  ? 'Total arena collisions'
                  : 'Waiting for collision data'}
              </span>
            </article>

            
<article className="stat-card">
  <span className="stat-icon">◉</span>
  <p>Kill Switch Status</p>

  <h2 className="warning-text">{killSwitch}</h2>

  <span className="stat-note">
    {killSwitch === 'ACTIVE'
      ? 'Emergency stop activated in simulation'
      : 'No emergency stop signal detected'}
  </span>

  <button
    onClick={handleKillSwitch}
    disabled={!connected || killSwitch === 'ACTIVE'}
    style={{
      marginTop: '12px',
      padding: '10px 16px',
      background: '#c0392b',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: connected && killSwitch !== 'ACTIVE'
        ? 'pointer'
        : 'not-allowed',
      opacity: connected && killSwitch !== 'ACTIVE' ? 1 : 0.6,
    }}
  >
    ACTIVATE E-STOP
  </button>
</article>

          </div>
        </section>

        <section className="activity-card" id="activity">
          <div className="card-heading">
            <div>
              <p className="section-label">MISSION HISTORY</p>
              <h3>Activity Log</h3>
            </div>
            <span className="muted">Live events</span>
          </div>

          <div className="empty-activity">
            {activity.length === 0 ? (
              <p className="muted">No mission events received yet.</p>
            ) : (
              activity.map((event, index) => (
                <p
                  key={`${index}-${event}`}
                  style={{
                    padding: '10px 5px',
                    borderBottom: '1px solid #203447',
                    color: '#a9bbcc',
                    fontSize: '12px',
                  }}
                >
                  {event}
                </p>
              ))
            )}
          </div>
        </section>

        <section className="activity-card">
          <div className="card-heading">
            <div>
              <p className="section-label">MISSION PERFORMANCE</p>
              <h3>FTP Score</h3>
            </div>
          </div>
          <pre style={{
            whiteSpace: 'pre-wrap',
            color: '#a9bbcc',
            fontSize: '13px',
          }}>
            {ftpScore ?? 'Waiting for FTP score data'}
          </pre>
        </section>

        <footer>
          NALA MISSION CONTROL · WEB DASHBOARD
          <span>LIVE DEVELOPMENT VERSION</span>
        </footer>
      </main>
    </div>
  )
}

export default App
