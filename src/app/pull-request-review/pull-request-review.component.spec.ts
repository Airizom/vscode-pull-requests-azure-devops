import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PullRequestReviewComponent } from './pull-request-review.component';

describe('PullRequestReviewComponent', () => {
  let component: PullRequestReviewComponent;
  let fixture: ComponentFixture<PullRequestReviewComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PullRequestReviewComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PullRequestReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
