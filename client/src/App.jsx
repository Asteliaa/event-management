import EventList from './components/EventList.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Платформа мероприятий</h1>
        <p>Конференции, вебинары и встречи. Данные хранятся в браузере (localStorage).</p>
      </header>
      <main>
        <EventList />
      </main>
    </div>
  );
}
